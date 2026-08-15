/* ---------------------------------------------------------------------------
 * The only file you need to edit.
 *
 * A Firebase web config is not a secret. Google publishes it in client code by
 * design — it names your project, it doesn't grant access to it. What actually
 * guards your data is firebase/database.rules.json, which you must deploy.
 * Ship this file with open rules and anyone can read and write your database.
 * ------------------------------------------------------------------------- */

export const firebaseConfig = {
  apiKey: "AIzaSyAPjs28h6ycvByAM-BRw6g73S85krCqdBc",
  authDomain: "watch2gether-41847.firebaseapp.com",
  projectId: "watch2gether-41847",
  storageBucket: "watch2gether-41847.firebasestorage.app",
  messagingSenderId: "488632064864",
  appId: "1:488632064864:web:5b008c4091154326fe5c05",
  measurementId: "G-BHMG0D9LGD",

  // Realtime Database, not Firestore. Firestore bills per document read, and a
  // once-a-second heartbeat would burn its 50,000/day quota before lunch.
  // Note the region in the host: databases outside us-central1 live on
  // firebasedatabase.app, not firebaseio.com. Yours is in Singapore.
  databaseURL: "https://watch2gether-41847-default-rtdb.asia-southeast1.firebasedatabase.app",

  // Bump if gstatic ever stops serving this release.
  sdkVersion: "11.0.2",
};

export const CFG = {
  // Vercel /api/proxy is used automatically when this is empty. Set this only
  // if you intentionally want an external proxy instead.
  // Optional. A deployed Cloudflare Worker if you also want a private library
  // of your own files. Leave empty and the app runs on YouTube, direct links
  // and local files alone — no storage bill, nothing to deploy but this page.
  API: "",

  // Optional. Public R2 domain, if you have one. Empty routes through the Worker.
  MEDIA: "",

  // Google Analytics (via the Firebase measurementId above). Off by default —
  // it's a third-party script, and ad blockers stop it more often than not.
  analytics: false,

  // Our own analytics: free, no third-party script, no cookies. Just appends
  // small anonymous event counts (page view, room joined, video started, chat
  // sent, ...) to the same Firebase Realtime Database you're already using
  // for room sync — see web/analytics.js and the analytics/ rules in
  // firebase/database.rules.json. Safe to leave on; safe to turn off.
  ownAnalytics: true,
};
