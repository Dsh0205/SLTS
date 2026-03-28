export function resolveDesktopBridge() {
  if (window.shanlicDesktop?.isElectron) {
    return window.shanlicDesktop;
  }

  try {
    if (window.parent && window.parent !== window && window.parent.shanlicDesktop?.isElectron) {
      return window.parent.shanlicDesktop;
    }
  } catch {
    return null;
  }

  return null;
}

window.resolveDesktopBridge = resolveDesktopBridge;
