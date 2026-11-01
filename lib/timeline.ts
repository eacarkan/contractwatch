import { isoDate } from "@/lib/deadline";
import type {
  CorrDirection,
  CorrRelation,
  DeadlineStatus,
} from "@/lib/generated/prisma/enums";

export type TimelineEntry =
  | { kind: "trigger"; date: Date; name: string }
  | { kind: "due"; date: Date; status: DeadlineStatus; rule: string }
  | {
      kind: "letter";
      date: Date;
      direction: CorrDirection;
      relation: CorrRelation;
      subject: string;
      referenceNo: string | null;
    };

const ORDER = { trigger: 0, letter: 1, due: 2 };

type Source = {
  deadlines: {
    dueOn: Date;
    status: DeadlineStatus;
    computedRule: string;
    event: { id: string; name: string; occurredOn: Date } | null;
  }[];
  links: {
    relation: CorrRelation;
    correspondence: {
      direction: CorrDirection;
      sentOn: Date;
      subject: string;
      referenceNo: string | null;
    };
  }[];
};

/**
 * Trigger, deadline, then letters by date. On the same day a letter comes before
 * the deadline it can still meet.
 */
export function buildTimeline({ deadlines, links }: Source): TimelineEntry[] {
  const triggers = new Map(
    deadlines.flatMap(({ event }) => (event ? [[event.id, event]] : [])) as [
      string,
      { name: string; occurredOn: Date },
    ][],
  );

  const entries: TimelineEntry[] = [
    ...[...triggers.values()].map((event): TimelineEntry => ({
      kind: "trigger",
      date: event.occurredOn,
      name: event.name,
    })),
    ...deadlines.map((deadline): TimelineEntry => ({
      kind: "due",
      date: deadline.dueOn,
      status: deadline.status,
      rule: deadline.computedRule,
    })),
    ...links.map(({ relation, correspondence }): TimelineEntry => ({
      kind: "letter",
      date: correspondence.sentOn,
      direction: correspondence.direction,
      relation,
      subject: correspondence.subject,
      referenceNo: correspondence.referenceNo,
    })),
  ];

  return entries.sort(
    (a, b) =>
      isoDate(a.date).localeCompare(isoDate(b.date)) ||
      ORDER[a.kind] - ORDER[b.kind],
  );
}
