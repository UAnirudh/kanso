/** Shared, dependency-free role vocabulary (safe for client components). */
export type Role = "owner" | "admin" | "member" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};
