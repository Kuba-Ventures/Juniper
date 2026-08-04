import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { createLinkToken, exchangePublicToken, type LinkInstitution } from "@/lib/plaid";
import { trackEngagement } from "@/lib/analytics";

// Sequential Plaid Link queue. The multi-select gallery lets a user pick several
// institutions (or "Select all") at once; because each institution needs its own
// Plaid credential flow, we open Link for them one at a time, minting a fresh
// link_token per institution and advancing on success or exit. (The true
// one-tap-for-all experience needs Plaid Layer, tier 1, gated on Production, this
// is the tier-2 gallery path that works today on Sandbox.)
//
// Queue position is kept in refs so the Plaid callbacks always read the current
// item, never a stale closure.

export type LinkResult = { linked: number; failed: number };

export type LinkQueueControls = {
  start: (institutions: LinkInstitution[]) => Promise<void>;
  busy: boolean;
  progress: { index: number; total: number };
  notice: string | null;
  setNotice: (n: string | null) => void;
};

export function useLinkQueue(opts?: {
  onItemLinked?: () => void;
  onDone?: (result: LinkResult) => void;
}): LinkQueueControls {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [notice, setNotice] = useState<string | null>(null);

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
    setProgress({ index: 0, total: 0 });
    queueRef.current = [];
    indexRef.current = 0;
    onDoneRef.current?.(result);
  }, []);

  // Open Plaid Link for the queue item at `at`; finish when the queue is drained.
  const openAt = useCallback(
    async (at: number) => {
      const q = queueRef.current;
      if (at >= q.length) {
        finish();
        return;
      }
      const token = await createLinkToken();
      if (!token) {
        setNotice("Account linking isn't enabled yet. You can add it later from Connections.");
        finish();
        return;
      }
      indexRef.current = at;
      setProgress({ index: at, total: q.length });
      setLinkToken(token);
    },
    [finish],
  );

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const institution: LinkInstitution | undefined = metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : queueRef.current[indexRef.current];
      setLinkToken(null);
      const item = await exchangePublicToken(publicToken, institution);
      if (item) {
        resultRef.current.linked += 1;
        trackEngagement("connection_linked");
        onItemLinkedRef.current?.();
      } else {
        resultRef.current.failed += 1;
      }
      void openAt(indexRef.current + 1);
    },
    [openAt],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
    // A cancel/exit skips just this institution and moves on to the rest.
    onExit: () => {
      setLinkToken(null);
      void openAt(indexRef.current + 1);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

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
