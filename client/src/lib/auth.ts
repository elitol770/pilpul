import { useQuery } from "@tanstack/react-query";

export type User = {
  id: string;
  email: string;
  firstName: string | null;
  city: string | null;
  timezone: string | null;
  ageConfirmed: boolean;
  matchingSuspendedAt: string | null;
  createdAt: string;
};

export function useAuth() {
  const q = useQuery<{ user: User | null }>({
    queryKey: ["/api/me"],
  });
  return {
    user: q.data?.user ?? null,
    isLoading: q.isLoading,
  };
}
