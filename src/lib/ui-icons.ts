// Published content and older API responses can still contain decorative icons.
export function contentIcon(icon: string, fallback: string): string {
  return icon === 'sparkles' || icon === 'sparkles-outline' ? fallback : icon;
}
