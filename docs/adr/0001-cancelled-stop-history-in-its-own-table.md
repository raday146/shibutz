# Cancelled-stop history lives in its own table

Cancelling a stop deletes its route row (so sequences stay gapless and a job can be placed again), which loses who the job belonged to and its actual times. We record that in a separate `job_cancellations` table, written in the same transaction as the cancel, instead of soft-deleting stops: `route_stops.job_id` is unique and every reader of stops would have to learn to skip the dead ones. A general event log was rejected as more than the readers (the work-day drawer, planned-vs-actual, delay input) need today.
