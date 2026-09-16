// Merchant name -> domain, for the favicon-service fallback tier in
// merchant-mark.tsx. This is deliberately NOT a hosted image list like
// mock-logos.ts: with hundreds of brands, sourcing and hosting a real logo
// file per brand is the maintenance debt (and the licensing exposure) #139
// already deleted a version of elsewhere in this app. A domain resolves to
// an image live, through the same favicon service partners.ts already
// trusts for affiliate cards (`s2/favicons`), so growing this list costs one
// line, not one hosted asset.
//
// A wrong or dead domain here is self-healing: `MerchantMark`'s onError
// drops through to the monogram exactly as it would with no entry at all,
// so this list is safe to grow generously rather than needing every domain
// individually verified.
//
// Matching is on word boundaries against Plaid's raw merchant string plus
// the display name, the same rule `merchantMark` in txn-format.ts already
// uses and for the same reason: "Ally" must not light up on "Rally's", and
// Plaid's merchant strings carry noise ("WHOLEFDS MKT 103", "TST* ...").
// Longest name wins so a more specific alias ("Amazon Prime") is preferred
// over a shorter one that would also match ("Amazon").
export const MERCHANT_DOMAINS: Record<string, string> = {
  // ── Quick service / fast food ──────────────────────────────────────────
  "McDonald's": "mcdonalds.com", McDonalds: "mcdonalds.com",
  "Burger King": "bk.com",
  "Wendy's": "wendys.com", Wendys: "wendys.com",
  "Taco Bell": "tacobell.com",
  KFC: "kfc.com",
  Popeyes: "popeyes.com",
  "Chick-fil-A": "chick-fil-a.com", "Chick fil A": "chick-fil-a.com",
  Subway: "subway.com",
  Chipotle: "chipotle.com",
  "Panera Bread": "panerabread.com", Panera: "panerabread.com",
  Sonic: "sonicdrivein.com",
  "Arby's": "arbys.com", Arbys: "arbys.com",
  "Jack in the Box": "jackinthebox.com",
  "Carl's Jr": "carlsjr.com", "Carls Jr": "carlsjr.com",
  "Hardee's": "hardees.com", Hardees: "hardees.com",
  Whataburger: "whataburger.com",
  "In-N-Out": "in-n-out.com", "In N Out": "in-n-out.com",
  "Five Guys": "fiveguys.com",
  "Shake Shack": "shakeshack.com",
  Wingstop: "wingstop.com",
  "Raising Cane's": "raisingcanes.com", "Raising Canes": "raisingcanes.com",
  "Zaxby's": "zaxbys.com", Zaxbys: "zaxbys.com",
  "Culver's": "culvers.com", Culvers: "culvers.com",
  "Dairy Queen": "dairyqueen.com",
  "Dunkin'": "dunkindonuts.com", Dunkin: "dunkindonuts.com",
  Starbucks: "starbucks.com",
  "Tim Hortons": "timhortons.com",
  "Krispy Kreme": "krispykreme.com",
  "Domino's": "dominos.com", Dominos: "dominos.com",
  "Pizza Hut": "pizzahut.com",
  "Papa John's": "papajohns.com", "Papa Johns": "papajohns.com",
  "Little Caesars": "littlecaesars.com",
  "Jimmy John's": "jimmyjohns.com", "Jimmy Johns": "jimmyjohns.com",
  "Firehouse Subs": "firehousesubs.com",
  "Jersey Mike's": "jerseymikes.com", "Jersey Mikes": "jerseymikes.com",
  Qdoba: "qdoba.com",
  "Del Taco": "deltaco.com",
  "El Pollo Loco": "elpolloloco.com",
  "Bojangles": "bojangles.com",
  "Church's Chicken": "churchschicken.com", "Churchs Chicken": "churchschicken.com",
  "White Castle": "whitecastle.com",
  "Long John Silver's": "ljsilvers.com",
  "Auntie Anne's": "auntieannes.com",
  Cinnabon: "cinnabon.com",
  "Baskin-Robbins": "baskinrobbins.com", "Baskin Robbins": "baskinrobbins.com",
  "Cold Stone Creamery": "coldstonecreamery.com",
  "Smoothie King": "smoothieking.com",
  Jamba: "jambajuice.com", "Jamba Juice": "jambajuice.com",

  // ── Casual / sit-down dining ────────────────────────────────────────────
  "Chili's": "chilis.com", Chilis: "chilis.com",
  "Applebee's": "applebees.com", Applebees: "applebees.com",
  "Olive Garden": "olivegarden.com",
  "Red Lobster": "redlobster.com",
  "Outback Steakhouse": "outback.com", Outback: "outback.com",
  IHOP: "ihop.com",
  "Denny's": "dennys.com", Dennys: "dennys.com",
  "Cracker Barrel": "crackerbarrel.com",
  "Buffalo Wild Wings": "buffalowildwings.com",
  "TGI Fridays": "tgifridays.com",
  "Texas Roadhouse": "texasroadhouse.com",
  "Cheesecake Factory": "thecheesecakefactory.com",
  "Red Robin": "redrobin.com",
  "Waffle House": "wafflehouse.com",
  "Golden Corral": "goldencorral.com",

  // ── Grocery / convenience ────────────────────────────────────────────────
  Walmart: "walmart.com", "Wal-Mart": "walmart.com",
  Target: "target.com",
  Costco: "costco.com",
  Kroger: "kroger.com",
  Safeway: "safeway.com",
  Albertsons: "albertsons.com",
  Publix: "publix.com",
  "Whole Foods": "wholefoodsmarket.com", "Whole Foods Market": "wholefoodsmarket.com",
  "Trader Joe's": "traderjoes.com", "Trader Joes": "traderjoes.com",
  Aldi: "aldi.us",
  "H-E-B": "heb.com", HEB: "heb.com",
  Meijer: "meijer.com",
  Wegmans: "wegmans.com",
  Sprouts: "sprouts.com",
  "Food Lion": "foodlion.com",
  Giant: "giantfood.com",
  "Stop & Shop": "stopandshop.com",
  ShopRite: "shoprite.com",
  "Winn-Dixie": "winndixie.com", "Winn Dixie": "winndixie.com",
  Vons: "vons.com",
  Ralphs: "ralphs.com",
  "Harris Teeter": "harristeeter.com",
  "Piggly Wiggly": "pigglywiggly.com",
  WinCo: "wincofoods.com",
  "7-Eleven": "7-eleven.com", "7 Eleven": "7-eleven.com",
  "Circle K": "circlek.com",
  Speedway: "speedway.com",
  Wawa: "wawa.com",
  Sheetz: "sheetz.com",
  QuikTrip: "quiktrip.com",
  "Casey's General Store": "caseys.com", "Caseys General Store": "caseys.com",
  "Royal Farms": "royalfarms.com",
  "Kum & Go": "kumandgo.com",

  // ── Big box / department / off-price ───────────────────────────────────
  "Best Buy": "bestbuy.com",
  "Home Depot": "homedepot.com",
  "Lowe's": "lowes.com", Lowes: "lowes.com",
  "Kohl's": "kohls.com", Kohls: "kohls.com",
  "Macy's": "macys.com", Macys: "macys.com",
  Nordstrom: "nordstrom.com",
  JCPenney: "jcpenney.com",
  "Dick's Sporting Goods": "dickssportinggoods.com",
  "TJ Maxx": "tjmaxx.com",
  Marshalls: "marshalls.com",
  Ross: "rossstores.com",
  Burlington: "burlington.com",
  "Big Lots": "biglots.com",
  "Dollar General": "dollargeneral.com",
  "Dollar Tree": "dollartree.com",
  "Five Below": "fivebelow.com",
  IKEA: "ikea.com",
  "Bed Bath & Beyond": "bedbathandbeyond.com",

  // ── Pharmacy / health ────────────────────────────────────────────────────
  CVS: "cvs.com",
  Walgreens: "walgreens.com",
  "Rite Aid": "riteaid.com",
  GNC: "gnc.com",
  "Vitamin Shoppe": "vitaminshoppe.com",

  // ── Gas ─────────────────────────────────────────────────────────────────
  Shell: "shell.com",
  Chevron: "chevron.com",
  ExxonMobil: "exxonmobil.com", Exxon: "exxon.com", Mobil: "mobil.com",
  BP: "bp.com",
  Marathon: "marathonpetroleum.com",
  Valero: "valero.com",
  Sunoco: "sunoco.com",
  Citgo: "citgo.com",
  "Phillips 66": "phillips66.com",
  Conoco: "conoco.com",
  Arco: "arco.com",

  // ── Airlines ────────────────────────────────────────────────────────────
  "American Airlines": "aa.com",
  Delta: "delta.com",
  "United Airlines": "united.com",
  Southwest: "southwest.com",
  JetBlue: "jetblue.com",
  "Alaska Airlines": "alaskaair.com",
  Spirit: "spirit.com",
  Frontier: "flyfrontier.com",
  Allegiant: "allegiantair.com",
  "Hawaiian Airlines": "hawaiianairlines.com",

  // ── Hotels / travel ─────────────────────────────────────────────────────
  Marriott: "marriott.com",
  Hilton: "hilton.com",
  Hyatt: "hyatt.com",
  "Best Western": "bestwestern.com",
  Wyndham: "wyndhamhotels.com",
  "Choice Hotels": "choicehotels.com",
  Airbnb: "airbnb.com",
  Vrbo: "vrbo.com",
  "La Quinta": "laquinta.com",
  Expedia: "expedia.com",
  Booking: "booking.com", "Booking.com": "booking.com",

  // ── Ride-share / delivery ────────────────────────────────────────────────
  Uber: "uber.com", "Uber Eats": "ubereats.com",
  Lyft: "lyft.com",
  DoorDash: "doordash.com",
  Grubhub: "grubhub.com",
  Instacart: "instacart.com",
  Postmates: "postmates.com",

  // ── Streaming / subscriptions ────────────────────────────────────────────
  Netflix: "netflix.com",
  Hulu: "hulu.com",
  "Disney+": "disneyplus.com", "Disney Plus": "disneyplus.com",
  "HBO Max": "hbomax.com", Max: "max.com",
  Peacock: "peacocktv.com",
  "Paramount+": "paramountplus.com", "Paramount Plus": "paramountplus.com",
  "ESPN+": "espn.com",
  "YouTube TV": "tv.youtube.com",
  "YouTube Premium": "youtube.com",
  "Apple TV+": "tv.apple.com",
  Spotify: "spotify.com",
  "Apple Music": "music.apple.com",
  Audible: "audible.com",
  "Kindle Unlimited": "amazon.com",
  "PlayStation Plus": "playstation.com", PlayStation: "playstation.com",
  "Xbox Game Pass": "xbox.com", Xbox: "xbox.com",
  Nintendo: "nintendo.com",
  "Sling TV": "sling.com",
  Crunchyroll: "crunchyroll.com",

  // ── Telecom / internet ───────────────────────────────────────────────────
  Verizon: "verizon.com",
  "AT&T": "att.com",
  "T-Mobile": "t-mobile.com",
  "Xfinity": "xfinity.com", Comcast: "xfinity.com",
  Spectrum: "spectrum.com",
  "Cox Communications": "cox.com",
  "Boost Mobile": "boostmobile.com",
  "Cricket Wireless": "cricketwireless.com",
  "Metro by T-Mobile": "metrobyt-mobile.com",
  "Mint Mobile": "mintmobile.com",

  // ── More fast food / QSR ─────────────────────────────────────────────────
  "Freddy's": "freddys.com", Freddys: "freddys.com",
  "Steak 'n Shake": "steaknshake.com", "Steak n Shake": "steaknshake.com",
  Fatburger: "fatburger.com",
  Checkers: "checkers.com",
  "Rally's": "checkers.com", "Rallys": "checkers.com",
  "Captain D's": "captainds.com", "Captain Ds": "captainds.com",
  "Boston Market": "bostonmarket.com",
  "Taco Time": "tacotime.com",

  // ── More casual dining ────────────────────────────────────────────────────
  Perkins: "perkinsrestaurants.com",
  "Bob Evans": "bobevans.com",
  "LongHorn Steakhouse": "longhornsteakhouse.com",
  "Carrabba's": "carrabbas.com", Carrabbas: "carrabbas.com",
  "Bonefish Grill": "bonefishgrill.com",
  "P.F. Chang's": "pfchangs.com", "PF Changs": "pfchangs.com",
  "Cheddar's": "cheddars.com", Cheddars: "cheddars.com",
  "Chuck E. Cheese": "chuckecheese.com",

  // ── More retail / apparel ────────────────────────────────────────────────
  "Party City": "partycity.com",
  "Urban Outfitters": "urbanoutfitters.com",
  "Forever 21": "forever21.com",
  "H&M": "hm.com",
  Zara: "zara.com",
  Gap: "gap.com",
  "Old Navy": "oldnavy.com",
  "Banana Republic": "bananarepublic.com",
  "American Eagle": "ae.com",
  Hollister: "hollisterco.com",
  Abercrombie: "abercrombie.com",
  "Foot Locker": "footlocker.com",
  Journeys: "journeys.com",
  Vans: "vans.com",
  Converse: "converse.com",
  Sephora: "sephora.com",
  "Ulta Beauty": "ulta.com", Ulta: "ulta.com",
  "Bath & Body Works": "bathandbodyworks.com",
  "Victoria's Secret": "victoriassecret.com", "Victorias Secret": "victoriassecret.com",
  "Sam's Club": "samsclub.com", "Sams Club": "samsclub.com",
  "BJ's Wholesale": "bjs.com", "BJs Wholesale": "bjs.com",
  "Petco": "petco.com",
  PetSmart: "petsmart.com",
  "Jo-Ann Fabrics": "joann.com", "JoAnn Fabrics": "joann.com", Joann: "joann.com",
  "Guitar Center": "guitarcenter.com",
  Menards: "menards.com",
  "Ace Hardware": "acehardware.com",
  "True Value": "truevalue.com",
  "Academy Sports": "academy.com",
  REI: "rei.com",
  "Bass Pro Shops": "basspro.com",
  "Cabela's": "cabelas.com", Cabelas: "cabelas.com",
  "Grocery Outlet": "groceryoutlet.com",
  "Fresh Market": "thefreshmarket.com",

  // ── Movers / storage / rentals ───────────────────────────────────────────
  "U-Haul": "uhaul.com", Uhaul: "uhaul.com",
  PODS: "pods.com",
  Zipcar: "zipcar.com",

  // ── Parking / scooters ───────────────────────────────────────────────────
  SpotHero: "spothero.com",
  ParkMobile: "parkmobile.io",
  Bird: "bird.co",
  Lime: "li.me",

  // ── Software / cloud subscriptions ───────────────────────────────────────
  "Microsoft 365": "microsoft.com", "Office 365": "microsoft.com",
  "Google One": "one.google.com", "Google Storage": "google.com",
  Dropbox: "dropbox.com",
  Canva: "canva.com",
  Zoom: "zoom.us",
  Slack: "slack.com",
  Notion: "notion.so",
  "1Password": "1password.com",
  LastPass: "lastpass.com",
  NordVPN: "nordvpn.com",
  ExpressVPN: "expressvpn.com",

  // ── Meal / subscription boxes ────────────────────────────────────────────
  HelloFresh: "hellofresh.com",
  "Blue Apron": "blueapron.com",
  "Dollar Shave Club": "dollarshaveclub.com",
  "Stitch Fix": "stitchfix.com",

  // ── Dating apps ──────────────────────────────────────────────────────────
  Tinder: "tinder.com",
  Bumble: "bumble.com",
  Hinge: "hinge.co",
  "Match.com": "match.com",

  // ── News / media subscriptions ───────────────────────────────────────────
  "Wall Street Journal": "wsj.com",
  "Washington Post": "washingtonpost.com",
  "The Athletic": "theathletic.com",

  // ── Ticketing (more) ─────────────────────────────────────────────────────
  Fandango: "fandango.com",
  "Vivid Seats": "vividseats.com",
  SeatGeek: "seatgeek.com",

  // ── Gyms (more) ──────────────────────────────────────────────────────────
  Orangetheory: "orangetheory.com",
  "Anytime Fitness": "anytimefitness.com",
  "Gold's Gym": "goldsgym.com", "Golds Gym": "goldsgym.com",
  F45: "f45training.com",

  // ── Retail / e-commerce ──────────────────────────────────────────────────
  Amazon: "amazon.com", "Amazon Prime": "amazon.com", "Amazon Fresh": "amazon.com",
  eBay: "ebay.com",
  Etsy: "etsy.com",
  Wayfair: "wayfair.com",
  Overstock: "overstock.com",
  Chewy: "chewy.com",
  Zappos: "zappos.com",
  Nike: "nike.com",
  Adidas: "adidas.com",
  Lululemon: "lululemon.com",
  GameStop: "gamestop.com",
  "Barnes & Noble": "barnesandnoble.com",
  "Office Depot": "officedepot.com",
  Staples: "staples.com",
  Michaels: "michaels.com",
  "Hobby Lobby": "hobbylobby.com",

  // ── Fitness / entertainment / tickets ────────────────────────────────────
  "Planet Fitness": "planetfitness.com",
  "LA Fitness": "lafitness.com",
  "24 Hour Fitness": "24hourfitness.com",
  Equinox: "equinox.com",
  YMCA: "ymca.net",
  "AMC Theatres": "amctheatres.com",
  "Regal Cinemas": "regmovies.com",
  Ticketmaster: "ticketmaster.com",
  StubHub: "stubhub.com",
  "Live Nation": "livenation.com",
  Ancestry: "ancestry.com",
  DraftKings: "draftkings.com",
  FanDuel: "fanduel.com",

  // ── Insurance / finance apps ─────────────────────────────────────────────
  Geico: "geico.com",
  Progressive: "progressive.com",
  "State Farm": "statefarm.com",
  Allstate: "allstate.com",
  USAA: "usaa.com",
  Venmo: "venmo.com",
  PayPal: "paypal.com",
  "Cash App": "cash.app",
  Zelle: "zellepay.com",
  Robinhood: "robinhood.com",
  Coinbase: "coinbase.com",

  // ── Auto / rental / parts ────────────────────────────────────────────────
  Enterprise: "enterprise.com",
  Hertz: "hertz.com",
  Avis: "avis.com",
  Budget: "budget.com",
  Turo: "turo.com",
  AutoZone: "autozone.com",
  "O'Reilly Auto Parts": "oreillyauto.com", "OReilly Auto Parts": "oreillyauto.com",
  "Advance Auto Parts": "advanceautoparts.com",

  // ── Shipping / services ──────────────────────────────────────────────────
  FedEx: "fedex.com",
  UPS: "ups.com",
  USPS: "usps.com",
  "Public Storage": "publicstorage.com",
  "Massage Envy": "massageenvy.com",
  "Great Clips": "greatclips.com",
  Supercuts: "supercuts.com",
};

const DOMAIN_NAMES = Object.keys(MERCHANT_DOMAINS).sort((a, b) => b.length - a.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function merchantDomain(raw: string | null, display: string): string | null {
  const hay = `${raw ?? ""} ${display}`;
  for (const name of DOMAIN_NAMES) {
    if (new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(hay)) return MERCHANT_DOMAINS[name];
  }
  return null;
}
