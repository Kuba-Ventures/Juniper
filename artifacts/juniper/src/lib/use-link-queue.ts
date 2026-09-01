import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { createLinkToken, exchangePublicToken, type LinkInstitution } from "@/lib/plaid";
import { trackEngagement } from "@/lib/analytics";

// Sequential Plaid Link queue: one link_token per institution, opened one at a
// time, advancing on success or exit. Callers hand it a single institution today,
// because Plaid Link authenticates exactly one per session and the multi-select
// gallery that used to queue several was removed for exactly that reason (see
// institution-picker.tsx). The queue shape stays because the OAuth return path
// below needs it: a bank that redirects the whole tab has to rehydrate "what was
// I linking, and what is left" from localStorage either way. (The true
// one-tap-for-many experience needs Plaid Layer, tier 1, gated on Production;
// this is the tier-2 path that works today on Sandbox.)
//
// Queue position is kept in refs so the Plaid callbacks always read the current
// item, never a stale closure.
//
// OAuth banks (Chase, BofA, most large US banks) can't show a password box
// inside Link. Plaid redirects the whole browser tab to the bank's site, and the
// bank returns the user to our registered redirect URI (PLAID_REDIRECT_URI, set
// to <domain>/app/connections). That full-page navigation wipes this hook's
// in-memory state, so before each open (any bank might be OAuth) we stash the
// active token + remaining queue in localStorage. On return the URL carries
// ?oauth_state_id=...; we rehydrate the stash and re-open Link with
// `receivedRedirectUri` to finish the handshake, then the queue continues as
// normal. Non-OAuth banks complete inline and the stash is cleared on finish.

export type LinkResult = { linked: number; failed: number };

const INFLIGHT_KEY = "juniper_plaid_link_inflight";

type Inflight = {
  token: string;
  queue: LinkInstitution[];
  index: number;
  result: LinkResult;
};

function readInflight(): Inflight | null {
  try {
    const raw = localStorage.getItem(INFLIGHT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Inflight;
    if (!v || typeof v.token !== "string" || !Array.isArray(v.queue)) return null;
    return v;
  } catch {
    return null;
  }
}

function writeInflight(v: Inflight): void {
  // If storage is blocked/full the only loss is OAuth resume for this attempt;
  // inline (non-OAuth) linking is unaffected, so fail quietly.
  try {
    localStorage.setItem(INFLIGHT_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function clearInflight(): void {
  try {
    localStorage.removeItem(INFLIGHT_KEY);
  } catch {
    /* ignore */
  }
}

// True when this page load is Plaid handing control back after an OAuth bank
// login (it appends ?oauth_state_id=... to our redirect URI).
function isOAuthReturn(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("oauth_state_id");
  } catch {
    return false;
  }
}

export type LinkQueueControls = {
  start: (institutions: LinkInstitution[]) => Promise<void>;
  busy: boolean;
  progress: { index: number; total: number };
  notice: string | null;
  setNotice: (n: string | null) => void;
};

export function useLinkQueue(opts?: {
  onItemLinked?: (institution?: string) => void;
  onDone?: (result: LinkResult) => void;
}): LinkQueueControls {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  // Set only while completing an OAuth return, so usePlaidLink resumes the
  // redirected flow instead of starting a new one. Cleared before the next queue
  // item opens fresh (a fresh open with receivedRedirectUri set would throw).
  const [oauthReturnUri, setOauthReturnUri] = useState<string | null>(null);

  const queueRef = useRef<LinkInstitution[]>([]);
  const indexRef = useRef(0);
  const resultRef = useRef<LinkResult>({ linked: 0, failed: 0 });
  const onItemLinkedRef = useRef(opts?.onItemLinked);
  const onDoneRef = useRef(opts?.onDone);
  onItemLinkedRef.current = opts?.onItemLinked;
  onDoneRef.current = opts?.onDone;

  const finish = useCallback(() => {
    const result = resultRef.current;
    setBusy(false);
    setLinkToken(null);
    setOauthReturnUri(null);
    setProgress({ index: 0, total: 0 });
    queueRef.current = [];
    indexRef.current = 0;
    clearInflight();
    onDoneRef.current?.(result);
  }, []);

  // Stash just enough to resume the queue if the next open redirects to a bank
  // for OAuth (which reloads the app). Overwritten per item, cleared on finish.
  const persist = useCallback((token: string) => {
    writeInflight({
      token,
      queue: queueRef.current,
      index: indexRef.current,
      result: resultRef.current,
    });
  }, []);

  // Open Plaid Link for the queue item at `at`; finish when the queue is drained.
  const openAt = useCallback(
    async (at: number) => {
      const q = queueRef.current;
      if (at >= q.length) {
        finish();
        return;
      }
      // A routing number, when the queue item came from Plaid's own search, asks
      // Link to highlight that bank in its list. Absent for "Search all banks"
      // and for institutions Plaid returns without one; Link then opens as usual.
      const { token, status } = await createLinkToken({
        routingNumber: q[at]?.routing_number ?? null,
        // Present only for a repair. Turns the whole open into update mode.
        itemId: q[at]?.item_id ?? null,
      });
      if (!token) {
        // 503 is the only status that means what "isn't enabled yet" says: Plaid
        // is not configured for this deployment. Every other failure is a fault
        // and should read like one, so the member retries instead of concluding
        // the feature does not exist. A bad product in the link-token payload
        // once made this 400 for a day and the old copy hid it completely.
        setNotice(
          status === 503
            ? "Account linking isn't enabled yet. You can add it later from Connections."
            : "Couldn't start account linking just now. Please try again in a moment.",
        );
        finish();
        return;
      }
      indexRef.current = at;
      setProgress({ index: at, total: q.length });
      setOauthReturnUri(null); // a fresh open, not an OAuth resume
      persist(token);
      setLinkToken(token);
    },
    [finish, persist],
  );

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      // Read from the QUEUE, not from Plaid's metadata: whether this was a
      // repair is something we decided when the token was minted, and metadata
      // describes the institution either way.
      const queued = queueRef.current[indexRef.current];
      const isUpdate = !!queued?.item_id;
      const institution: LinkInstitution | undefined = metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : queued;
      setLinkToken(null);
      setOauthReturnUri(null);

      if (isUpdate) {
        // NO EXCHANGE. In update mode the existing access_token is what was
        // repaired and it keeps working; exchanging the public token would mint
        // a SECOND item for the same institution, which is the duplicate this
        // whole path exists to avoid. Counted as linked so the caller's onDone
        // refreshes and resyncs exactly as it would for a new connection, which
        // is also what clears the dead-item error off the row.
        resultRef.current.linked += 1;
        trackEngagement("connection_linked");
        onItemLinkedRef.current?.(institution?.name);
        void openAt(indexRef.current + 1);
        return;
      }

      const item = await exchangePublicToken(publicToken, institution);
      if (item) {
        resultRef.current.linked += 1;
        trackEngagement("connection_linked");
        onItemLinkedRef.current?.(institution?.name);
      } else {
        resultRef.current.failed += 1;
      }
      void openAt(indexRef.current + 1);
    },
    [openAt],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    // Only set on an OAuth return; undefined for normal inline opens.
    receivedRedirectUri: oauthReturnUri ?? undefined,
    onSuccess,
    // A cancel/exit skips just this institution and moves on to the rest.
    onExit: () => {
      setLinkToken(null);
      setOauthReturnUri(null);
      void openAt(indexRef.current + 1);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  // On mount, resume a queue interrupted by an OAuth redirect. Plaid returns the
  // user to our redirect URI with ?oauth_state_id=...; we rehydrate the stashed
  // token + queue and re-open Link with the current URL as receivedRedirectUri
  // to finish the handshake, after which the queue continues as normal. Runs
  // once; strips the oauth params so a refresh can't re-trigger it.
  const claimedRef = useRef(false);
  useEffect(() => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    const inflight = readInflight();
    if (isOAuthReturn() && inflight) {
      queueRef.current = inflight.queue;
      indexRef.current = inflight.index;
      resultRef.current = inflight.result;
      setBusy(true);
      setProgress({ index: inflight.index, total: inflight.queue.length });
      setOauthReturnUri(window.location.href);
      setLinkToken(inflight.token);
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        /* ignore */
      }
    } else if (inflight) {
      // Stale stash from an abandoned flow with no OAuth return to complete it;
      // drop it so it can't resurface on a later, unrelated link.
      clearInflight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    async (institutions: LinkInstitution[]) => {
      if (busy) return;
      // Empty selection falls back to a single open of Plaid's full search.
      const list = institutions.length ? institutions : [{}];
      setNotice(null);
      resultRef.current = { linked: 0, failed: 0 };
      queueRef.current = list;
      indexRef.current = 0;
      setBusy(true);
      await openAt(0);
    },
    [busy, openAt],
  );

  return { start, busy, progress, notice, setNotice };
}
