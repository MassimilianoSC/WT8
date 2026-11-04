import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MeDTO, MembershipDTO } from "@/lib/contract";
import { canCreateIn, canSeeStats, groupsIn, isLeader, membershipSummary, visibleTemplates } from "@/components/me/me-derive";
import { MissingUser } from "@/components/me/missing-user";

function user(memberships: MembershipDTO[], extra: Partial<MeDTO> = {}): MeDTO {
  return {
    id: "u", name: "U", email: "u@example.it", status: "active", isAdmin: false, memberships,
    canCreate: [], mustChangePassword: false, createdAt: "2026-09-01T09:00:00+02:00", updatedAt: "2026-09-01T09:00:00+02:00", ...extra,
  };
}

const PM_LEADER = user(
  [
    { templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: true },
    { templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: false },
  ],
  { canCreate: ["INWIT", "ILIAD"] }
);
const UT_PE = user([
  { templateId: "TOWERNET", group: "UT_PE", role: "UT", leader: false },
  { templateId: "TOWERNET", group: "UT_PE", role: "PE", leader: false },
]);
const DL = user([{ templateId: "LEONARDO", group: "DL", role: "DL", leader: false }]);
const ADMIN = user([], { isAdmin: true, canCreate: ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"] });

describe("me-derive", () => {
  it("visible templates: the memberships, in contract order; ADMIN = all", () => {
    expect(visibleTemplates(PM_LEADER)).toEqual(["ILIAD", "INWIT"]);
    expect(visibleTemplates(UT_PE)).toEqual(["TOWERNET"]);
    expect(visibleTemplates(ADMIN)).toBeNull();
  });

  it("groups of the user in a template; ADMIN starts on PM/Permessi; none elsewhere", () => {
    expect(groupsIn(PM_LEADER, "INWIT")).toEqual(["PM_PERMESSI"]);
    expect(groupsIn(UT_PE, "TOWERNET")).toEqual(["UT_PE"]);
    expect(groupsIn(DL, "INWIT")).toEqual([]);
    expect(groupsIn(ADMIN, "INWIT")).toEqual(["PM_PERMESSI"]);
    expect(groupsIn(null, "INWIT")).toEqual([]);
  });

  it("creation follows canCreate (D-20): PM and ADMIN, never DL", () => {
    expect(canCreateIn(PM_LEADER, "INWIT")).toBe(true);
    expect(canCreateIn(PM_LEADER, "TOWERNET")).toBe(false);
    expect(canCreateIn(DL, "LEONARDO")).toBe(false);
    expect(canCreateIn(ADMIN, "LEONARDO")).toBe(true);
  });

  it("team leader in any membership", () => {
    expect(isLeader(PM_LEADER)).toBe(true);
    expect(isLeader(UT_PE)).toBe(false);
    expect(isLeader(null)).toBe(false);
  });
});

describe("MissingUser", () => {
  it("explains a user who is not (or no longer) active (404)", () => {
    render(<MissingUser state={{ status: "missing", email: "mario@example.it" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Il tuo utente (mario@example.it) non è attivo in PracticeHub. Chiedi all'amministratore di invitarti o di riattivarti."
    );
  });

  it("renders nothing for a user that is there", () => {
    const { container } = render(<MissingUser state={{ status: "ok", me: ADMIN }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains an unreachable new model", () => {
    render(<MissingUser state={{ status: "error" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("non è raggiungibile");
  });

  it("sums up the memberships for the sidebar and says who sees the statistics", () => {
    expect(membershipSummary(PM_LEADER)).toBe("PM leader · INWIT — PM · ILIAD");
    expect(membershipSummary(ADMIN)).toBe("Amministratore");
    expect(membershipSummary(null)).toBe("");
    expect(canSeeStats(PM_LEADER)).toBe(true);
    expect(canSeeStats(user([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]))).toBe(false);
    expect(canSeeStats(user([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: true }]))).toBe(true);
  });
});
