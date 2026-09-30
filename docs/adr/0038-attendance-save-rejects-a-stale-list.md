# Attendance save rejects a stale list

Saving a Session freezes the eligible list the Owner marked. The save sends those Player ids and which of them are present. The command settles any finished dated pause, recomputes eligibility for that date, and rejects the save when the sets differ. The Owner reloads and marks again. A save that recomputed a new list, or that trusted the client without checking, would either mark people the Owner never saw or store a list that is no longer true.

**Considered options:** Recompute at save time and freeze that new list (rejected — Players who joined become absent without being shown); write the client list without checking (rejected — a stale page can store Players who are no longer eligible).
