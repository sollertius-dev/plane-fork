/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";

const H = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-8 mb-2 text-[16px] font-semibold text-primary first:mt-0">{children}</h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="mb-2 text-[14px] leading-6 text-secondary">{children}</p>;
const Li = ({ children }: { children: ReactNode }) => <li className="mb-1 text-[14px] leading-6 text-secondary">{children}</li>;
const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-primary">{children}</span>;
const Row = ({ a, b }: { a: string; b: ReactNode }) => (
  <tr className="border-b border-subtle align-top">
    <td className="w-44 py-2 pr-4 text-[13px] font-medium text-primary">{a}</td>
    <td className="py-2 text-[13px] leading-5 text-secondary">{b}</td>
  </tr>
);

// Team guide for the WBS schedule. Plain text on purpose, so that it is easy to edit when the team agrees on rules.
export function WbsGuideline() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <H>What this page is for</H>
        <P>
          The WBS schedule is the <B>high-level plan</B> of the whole ecosystem: which phases and epics exist, how big
          they are, who works on them and when. Day-to-day work (user stories, tech stories, bugs) stays in the Plane
          projects. This page links the two: a row of the plan can be linked to the work items that do the work.
        </P>
        <P>
          Rows have three levels: <B>Phase</B> (for example Price Feeder), <B>Epic</B> (a large outcome inside the
          phase) and <B>Touch point</B> (a piece of an epic that one person can estimate). Use two levels below a phase,
          no more.
        </P>

        <H>Reading the screen</H>
        <table className="mb-2 w-full">
          <tbody>
            <Row a="Man-day" b="The work to do, in days of one person. You enter it on the lowest row." />
            <Row a="Effort" b="The share of a person's time given to the row, from 1% to 100%. 50% means half of the working time." />
            <Row a="Lead" b="How long the row takes on the calendar: Man-day ÷ Effort, rounded up. 6 man-days at 50% is 12 days. You cannot type it. Change Man-day or Effort instead." />
            <Row a="Start" b="The first day of the row. You enter it. The end date is Start + Lead." />
            <Row a="Assignee, Status" b="Taken from the linked work items (see below). You do not type them." />
            <Row a="Bars" b="One bar per row, coloured by phase. A darker, thicker bar is a touch point, a lighter one an epic, a thin one the whole phase. A tick on a touch point means all its work items are done." />
            <Row a="Red line, Now" b="Today." />
            <Row a="Dashed lines" b="Milestones. The flag at the top shows the name. Hover for the date." />
          </tbody>
        </table>
        <P>
          Time is counted in <B>calendar days</B>, weekends included. Plan with that in mind: 5 working days is 7
          calendar days.
        </P>

        <H>How the numbers add up</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li>An <B>epic with touch points</B> is the sum of them: its man-day is the total, it starts with the earliest touch point and ends with the latest. Its numbers are grey because you edit the touch points, not the epic.</Li>
          <Li>A <B>phase</B> is the sum of its epics in the same way.</Li>
          <Li>An epic with no touch point is a row of its own: you enter Man-day, Effort and Start on it.</Li>
          <Li>The sum counts what you entered. It is an estimate, not a measurement of the work done.</Li>
        </ul>

        <H>Everyday tasks</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li><B>Add a phase:</B> press <B>+ Phase</B> in the toolbar, type the name, press Enter. The colour square in front of a phase changes its bar colour.</Li>
          <Li><B>Add an epic or a touch point:</B> point at a phase or an epic and press <B>+</B> at the end of its name. The new row is created at once with a default name and the name is open for typing. Press Enter to keep the name, or ✕ to delete the row.</Li>
          <Li><B>Edit a value:</B> click it, type, press Enter (Esc cancels). Names, Man-day, Effort (type 60 for 60%) and Start can be edited on rows that are not a sum.</Li>
          <Li><B>Delete a row:</B> point at it and press ✕. Its children go with it. Work items in Plane are never deleted.</Li>
          <Li><B>Add a milestone:</B> press <B>+ Milestone</B>, type a name, pick the date, press Add. To remove one, click its flag at the top. A milestone cannot be edited yet: remove it and add it again.</Li>
          <Li><B>Collapse or expand:</B> the arrow in front of a row, or <B>Collapse all</B> and <B>Expand all</B>.</Li>
          <Li><B>Hide details:</B> keeps only the names, which leaves more room for the timeline.</Li>
        </ul>

        <H>Moving along the timeline</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li>The bar at the bottom of the screen is the scroll bar: drag the thumb, click the track to move a page, or use ◀ ▶ at its ends.</Li>
          <Li>The ◀ ▶ buttons in the toolbar move the timeline by six weeks. <B>Today</B> brings the red line back into view.</Li>
          <Li>A trackpad or Shift + mouse wheel also scrolls sideways.</Li>
        </ul>

        <H>Linking work items</H>
        <P>
          A touch point (or an epic without touch points) can be linked to <B>any number of work items</B> from any
          project that you belong to.
        </P>
        <ul className="mb-2 ml-5 list-disc">
          <Li>Point at the row and press <B>🔗 Link</B>. Once something is linked, the button shows the first key, for example <B>PFD-3 +2</B>.</Li>
          <Li>The box lists the linked items. Press ✕ next to one to unlink it. Type a name or a key such as PFD-3 to search, and click a result to link it. The box stays open so that you can link several.</Li>
          <Li>The <B>Status</B> of the row comes from its work items: <B>Done</B> when all are completed, <B>In progress</B> when at least one has started or is done, <B>Not started</B> otherwise, with a counter such as 2/5. Cancelled items are not counted.</Li>
          <Li>The <B>Assignee</B> is everyone assigned to the linked work items.</Li>
          <Li>The key is a link: it opens the work item in Plane.</Li>
          <Li>On an epic that has touch points, the status column shows how many touch points are done. Link work items to the touch points, not to such an epic.</Li>
        </ul>

        <H>Who can do what</H>
        <P>
          Admins and members can change the schedule. Guests can read it. You only see and link work items of projects
          you are a member of.
        </P>

        <H>Suggested team rules (to be agreed, then edit this text)</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li>Estimate on touch points only. Say what Man-day means (one person working on the item, all included) and keep one value of Effort for the team unless someone really works part time.</Li>
          <Li>Update the plan at the end of every sprint: Man-day when the estimate changed, Start when a row moved. Do not rewrite the past; add a milestone for what was missed.</Li>
          <Li>Create the work items in the project first, then link them to the touch point they belong to. One work item belongs to one touch point.</Li>
          <Li>Keep names short and the same as in the project when possible, so that people find them.</Li>
        </ul>

        <H>Questions you may have</H>
        <table className="mb-8 w-full">
          <tbody>
            <Row a="Why can't I edit the Lead?" b="Lead is calculated. Change Man-day or Effort, or move the Start." />
            <Row a="Why are the numbers of an epic grey?" b="It has touch points, so it shows their sum. Edit the touch points." />
            <Row a="I added a touch point and the epic's Man-day became 0." b="The epic now shows the sum of its touch points. The Man-day you typed before on the epic is no longer used. Enter the estimate on the touch point." />
            <Row a="The status says Not started but the work began." b="Status follows the work items. Check that they are linked to this row and that their state in Plane is started." />
            <Row a="I cannot find my work item when linking." b="You only see work items of projects you belong to. Search by name or by key (PFD-3)." />
            <Row a="The page shows an error or stays empty." b="Reload the page. If it persists, tell the person who runs Plane." />
          </tbody>
        </table>
      </div>
    </div>
  );
}
