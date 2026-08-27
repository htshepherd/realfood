"use client";

import * as React from "react";

export function PwaRegistration() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
