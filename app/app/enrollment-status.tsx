import { TermStatus } from "@/lib/enrollments";

export default function EnrollmentStatus({
  status,
  startsLater = false,
}: {
  status: TermStatus;
  startsLater?: boolean;
}) {
  if (startsLater) {
    return (
      <span className="badge badge-soft badge-info mx-2 my-2">Starts later</span>
    );
  }
  if (status === "active") {
    return (
      <span className="badge badge-soft badge-success mx-2 my-2">Active</span>
    );
  }
  if (status === "paused") {
    return (
      <span className="badge badge-soft badge-warning mx-2 my-2">Paused</span>
    );
  }
  return <span className="badge badge-soft badge-error mx-2 my-2">Lapsed</span>;
}
