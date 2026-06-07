const STORAGE_KEY = "logi_push_enabled";

export function isPushEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setPushEnabled(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(value));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function sendStockNotification(productName: string, currentStock: number, minStock: number): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!isPushEnabled()) return;

  new Notification("⚠️ Stock crítico — LogiAnalytics Pro", {
    body: `${productName}: ${currentStock} uds (mín. ${minStock})`,
    icon: "/favicon.ico",
    tag: `stock-${productName}`,
  });
}
