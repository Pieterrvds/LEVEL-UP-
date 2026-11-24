// Who sees which screens. At most four buttons in the bar at the bottom; everything else sits one tap deeper.
import { CalendarDays, House, MessageCircle, Sun, UserRound, UsersRound, LayoutDashboard, Ellipsis } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "klant" | "coach" | "admin";
export type NavItem = { to: string; label: string; icon: LucideIcon };

export const NAV: Record<Role, NavItem[]> = {
  klant: [
    { to: "/", label: "Start", icon: House },
    { to: "/boeken", label: "Boeken", icon: CalendarDays },
    { to: "/chat", label: "Chat", icon: MessageCircle },
    { to: "/profiel", label: "Profiel", icon: UserRound },
  ],
  coach: [
    { to: "/", label: "Vandaag", icon: Sun },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/chat", label: "Chat", icon: MessageCircle },
    { to: "/profiel", label: "Profiel", icon: UserRound },
  ],
  admin: [
    { to: "/", label: "Overzicht", icon: LayoutDashboard },
    { to: "/team", label: "Team", icon: UsersRound },
    { to: "/chat", label: "Chat", icon: MessageCircle },
    { to: "/meer", label: "Meer", icon: Ellipsis },
  ],
};
export const ROLE_LABEL: Record<Role, string> = { klant: "Klant", coach: "Coach", admin: "Beheer" };
