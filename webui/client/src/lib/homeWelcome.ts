/** Local-time welcome for the dashboard hero; ~10+ lines per day, varied by hour. */

export type HomeWelcomeParts = { lead: string; tail: string };

type Line = { lead: string; question?: boolean };

function bucket(h: number): Line[] {
  if (h >= 0 && h < 5) {
    return [
      { lead: "It's late" },
      { lead: "Still up", question: true },
      { lead: "Quiet night" },
      { lead: "Night owl hour" },
      { lead: "Up with the stars" },
      { lead: "What next", question: true },
    ];
  }
  if (h < 9) {
    return [
      { lead: "Good morning" },
      { lead: "Rise and shine" },
      { lead: "Early bird" },
      { lead: "Fresh start" },
    ];
  }
  if (h < 12) {
    return [
      { lead: "Good morning" },
      { lead: "Morning" },
      { lead: "Mid-morning hello" },
    ];
  }
  if (h < 17) {
    return [
      { lead: "Good afternoon" },
      { lead: "Afternoon" },
      { lead: "Hope your day's going well" },
      { lead: "Back at it", question: true },
    ];
  }
  if (h < 21) {
    return [
      { lead: "Good evening" },
      { lead: "Evening" },
      { lead: "Winding down", question: true },
      { lead: "Golden hour" },
    ];
  }
  return [
    { lead: "Good evening" },
    { lead: "Still here", question: true },
    { lead: "One more round", question: true },
    { lead: "Night mode" },
  ];
}

function stablePickIndex(length: number, now: Date, hour: number): number {
  const mix =
    now.getFullYear() * 3 +
    (now.getMonth() + 1) * 29 +
    now.getDate() * 17 +
    hour * 13 +
    (now.getMinutes() >> 2);
  return Math.abs(mix) % length;
}

export function homeWelcomeParts(now: Date, addressName: string | undefined): HomeWelcomeParts {
  const name = addressName?.trim() || "friend";
  const h = now.getHours();
  const lines = bucket(h);
  const line = lines[stablePickIndex(lines.length, now, h)]!;

  if (line.question) {
    return { lead: line.lead, tail: `, ${name}?` };
  }
  return { lead: line.lead, tail: `, ${name}` };
}
