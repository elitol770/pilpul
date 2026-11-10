import { useHashLocation } from "wouter/use-hash-location";

// Magic links keep their token inside the fragment so it is not sent with
// the page request. Wouter's hash hook includes that query in its route path;
// match only the pathname while leaving the original hash available to callers.
export function useHashPathLocation(
  options?: Parameters<typeof useHashLocation>[0],
): ReturnType<typeof useHashLocation> {
  const [location, navigate] = useHashLocation(options);
  return [location.split("?")[0], navigate];
}

useHashPathLocation.hrefs = (href: string) => "#" + href;
