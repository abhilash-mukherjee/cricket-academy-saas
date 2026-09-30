---
name: manual-testing-checklist
description: One sitting-sized manual test plan for the tickets you pass in.
argument-hint: "Issue numbers, URLs, or pasted tickets"
disable-model-invocation: true
---

# Manual testing checklist

Turn the tickets the user passes in into one **combined plan**: a single checklist they walk in one **sitting**, covering each outcome's happy path and its major edges. The deliverable is the reply.

## Process

### 1. Resolve the tickets

The user's message is the ticket set: GitHub issue numbers or URLs, pasted ticket text, or both. If they named no tickets, ask for them and stop.

Fetch each number or URL with `gh issue view <n> --comments`. Pasted text is already the ticket.

**Done when** every named ticket's body and comments are in hand. If a number or URL does not resolve, name it and stop.

### 2. Map each ticket to screens

Read the code that implements the ticket, and stop once you can name the screen, the control, and the observable result. Use the words in `CONTEXT.md`.

If that change is not in the tree yet, take the screen and the action from the ticket and mark the row **from the ticket**.

**Done when** every user-visible change in the set points at a screen a person opens.

### 3. Collapse to outcomes

Merge tickets that change the same walk into one outcome. An outcome is one sentence a person can demo.

**Done when** every ticket sits on at least one outcome, and each outcome is a different walk.

### 4. Pick the cases

A **happy path** is the success the tickets promise. For each outcome, write one, in the order a person would do it.

A **major edge** earns a row only when both are true:

- A person using the product would hit it, or an acceptance criterion requires it.
- If it failed, that ticket would not be done.

Two inputs that fail the same way are one case. Keep the one a person is most likely to hit.

Illustration. Happy path: the person completes the action the ticket promises and sees the result. Kept edge: the same action when the record it would create already exists. Cut: a second invalid input that fails the same validation as one already kept.

At most two major edges per outcome. The plan is at most 12 cases. That ceiling is a max, not a target: one outcome is often the happy path plus a single edge.

If the honest set is over 12, drop the edges a person is least likely to hit until it fits. List each dropped edge in one line under the plan so the user can pull it back.

**Done when** every outcome has its happy path, every kept edge meets both bars, the case count is 12 or under, and any dropped edge is named.

### 5. Write the plan

Shared setup once: only the records the cases need. Within a flow, the happy path first, then its edges, so later rows reuse earlier state. Each row names the screen, the action, the expected result, and the ticket numbers it covers. One row may cover several tickets.

```markdown
# Manual test plan

**Setup:** …

## <flow>
- [ ] **Happy path** — <action on the named screen>. Expect <observable result>. Covers #<n>
- [ ] **Edge** — …
```

When edges were dropped:

```markdown
**Cut to fit one sitting:** <one line per dropped edge, with its ticket number>
```

**Done when** each row is enough to perform the check, and every ticket number appears on at least one row.
