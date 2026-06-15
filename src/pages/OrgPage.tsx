import { useParams } from "@tanstack/react-router"

import { useCourseTeacherAccess } from "@/hooks/useCourseTeacherAccess"
import useGetClasses from "@/hooks/useGetClasses"
import { useEffect } from "react"

const OrgPage = () => {
  const params = useParams({ from: "/$org/" })
  const { isTeacher, isStudent, isBlocked } = useCourseTeacherAccess(params.org)
  const { data: classesData } = useGetClasses(params.org)

  useEffect(() => {
    console.log("is teacher", isTeacher)
    console.log("is student", isStudent)
    console.log("is blocked", isBlocked)
    console.log("classes data", classesData)
  }, [isTeacher, isStudent, isBlocked, classesData])

  return (
    <div>
      <div>Is student: {String(isStudent)}</div>
      <div>Is teacher: {String(isTeacher)}</div>
      <div>Is blocked: {String(isBlocked)}</div>
      <hr />

      <div>
        <h3>Classes</h3>
        <ul>
          {classesData
            ?.filter?.((cl) => cl.type === "dir" && cl.name !== ".github")
            .map((cl) => (
              <li>{cl.name}</li>
            ))}
        </ul>
      </div>
    </div>
  )
}

export default OrgPage
