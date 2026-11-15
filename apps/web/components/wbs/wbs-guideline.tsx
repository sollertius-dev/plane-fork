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

        <H>Several WBS, each with its own projects</H>
        <P>
          A workspace can hold <B>more than one WBS</B>, for example one per product. Each WBS is tied to a set of
          projects. Use the <B>WBS</B> selector at the top right to switch, <B>+ New WBS</B> to create one and{" "}
          <B>Edit</B> to rename it or change its projects.
        </P>
        <ul className="mb-2 ml-5 list-disc">
          <Li>A WBS can only work with the work items of <B>its own projects</B>. If WBS X has projects A, B and C, and WBS Y has D, E and F, then X links and searches work items of A, B and C only, and never those of D, E and F.</Li>
          <Li>You can only add a project that you are a member of, and you only see work items of such projects.</Li>
          <Li>If you remove a project from a WBS, the links to its work items disappear from view and from the status. They come back if you add the project again.</Li>
          <Li>Deleting a WBS deletes its phases, rows, milestones and links. Plane work items are never deleted.</Li>
        </ul>

        <H>Reading the screen</H>
        <table className="mb-2 w-full">
          <tbody>
            <Row a="Man-day" b="The work to do, in days of one person. You enter it on the lowest row." />
            <Row a="Effort" b="The share of a person's time given to the row, from 1% to 100%. 50% means half of the working time." />
            <Row a="Lead" b="How long the row takes, in working days: Man-day ÷ Effort, rounded up. 6 man-days at 50% is 12 working days. You cannot type it. Change Man-day or Effort instead." />
            <Row a="Start" b="The first day of the row. You enter it. The end is the last working day of the Lead. If you enter a day off, the row starts on the next working day and the date is marked with *." />
            <Row a="Assignee, Status" b="Taken from the linked work items (see below). You do not type them. Assignees are shown as round avatars (up to three, then +N). Hover for the names." />
            <Row a="Bars" b="One bar per row, coloured by phase. A darker, thicker bar is a touch point, a lighter one an epic, a thin one the whole phase. A tick on a touch point means all its work items are done." />
            <Row a="Red line, Now" b="Today." />
            <Row a="Dashed lines" b="Milestones. The flag at the top shows the name. Hover for the date." />
            <Row a="Grey columns" b="Days off of this WBS: the weekdays that are not worked and the holidays." />
          </tbody>
        </table>
        <H>Working days</H>
        <P>
          Every WBS has its own <B>working calendar</B>: which weekdays are worked, and which dates are days off. New
          WBS start with Monday to Friday. Open <B>Edit</B> at the top right to change it: press the weekday buttons
          (Mon to Sun, in any combination, so a Saturday or Sunday can be a working day) and add holidays as dates.
        </P>
        <ul className="mb-2 ml-5 list-disc">
          <Li>Lead time counts <B>working days only</B>. 5 man-days at 100% starting on Monday ends on Friday of the same week. 10 man-days starting on Thursday ends on Wednesday of the week after next, because the weekend is skipped.</Li>
          <Li>The grey columns on the timeline are the days off. Bars run across them, and no work is counted there.</Li>
          <Li>If you enter a Start that is a day off, the row starts on the next working day. The Start column shows that day, with a *, and keeps your date for editing.</Li>
          <Li>A phase or an epic that is a sum shows the working days between its earliest start and its latest end.</Li>
          <Li>Changing the calendar moves the end dates of existing rows. Start dates and estimates stay as they are.</Li>
        </ul>

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

        <H>Resizing the table</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li>Drag the right edge of any column header to make that column wider or narrower. Widen the first column to read long names in full. Double-click an edge to put the column back to its default width.</Li>
          <Li>The widths are remembered in your browser. Hover over a cut name to see it in full.</Li>
          <Li>Dates are shown as DD/MM/YY.</Li>
        </ul>

        <H>Moving along the timeline</H>
        <ul className="mb-2 ml-5 list-disc">
          <Li>The bar at the bottom of the screen is the scroll bar: drag the thumb, click the track to move a page, or use ◀ ▶ at its ends.</Li>
          <Li>The ◀ ▶ buttons at the two ends of the timeline header move it by six weeks. <B>Today</B> in the toolbar brings the red line back into view.</Li>
          <Li>A trackpad or Shift + mouse wheel also scrolls sideways.</Li>
        </ul>

        <H>Linking work items</H>
        <P>
          A touch point (or an epic without touch points) can be linked to <B>any number of work items</B> from any
          project that you belong to.
        </P>
        <ul className="mb-2 ml-5 list-disc">
          <Li>Point at the row and press <B>🔗 Link</B>. The box searches the projects of the current WBS. Once something is linked, the button shows the first key, for example <B>PFD-3 +2</B>.</Li>
          <Li>The box lists the linked items. Press ✕ next to one to unlink it. Type a name or a key such as PFD-3 to search, and click a result to link it. The box stays open so that you can link several.</Li>
          <Li>The <B>Status</B> of the row comes from its work items: <B>Done</B> when all are completed, <B>In progress</B> when at least one has started or is done, <B>Not started</B> otherwise, with a counter such as 2/5. Cancelled items are not counted.</Li>
          <Li>The <B>Assignee</B> is everyone assigned to the linked work items.</Li>
          <Li>Click the key or the name of a work item to open it in the <B>side view</B>, as in the work item lists, without leaving this page. Close it and the statuses refresh. Ctrl or Cmd + click opens the full page in a new tab.</Li>
          <Li><B>See what is linked:</B> the arrow in front of an epic or touch point opens its work items as grey rows underneath, with their key, name, assignees and Plane state. A thin outlined bar shows the work item's own start and due dates in Plane, if it has them, so that you can compare the plan with what the team really scheduled. Point at one of these rows and press ✕ to unlink it. A row with no children and no work items has no arrow. <B>Expand all</B> opens everything.</Li>
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
            <Row a="Why did my Start date change?" b="You entered a day off of this WBS (for example a Saturday). The row starts on the next working day. Change the working days with Edit if you do work on that day." />
            <Row a="Our team works on Saturdays." b="Press Edit at the top right and switch Sat on in Working days. Add public holidays under Days off." />
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
