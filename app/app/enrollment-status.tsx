import { TermStatus } from "@/lib/enrollments";

export default function EnrollmentStatus({status} : {status : TermStatus}) {
    if (status === "active") {
        return (
            <span className="badge badge-soft badge-success mx-2 my-2">Active</span>
        )
    } else if (status == "paused") {
        return (
            <span className="badge badge-soft badge-warning mx-2 my-2">Paused</span>
        )
    } else {
        return (
            <span className="badge badge-soft badge-error mx-2 my-2">Lapsed</span>
        )
    }
}