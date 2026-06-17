import { parseDocument } from "yaml"
import { z } from "zod"

const Classroom50YamlSchema = z.object({
  classroom: z.string().min(1),
  assignment: z.string().min(1),
  source: z.object({
    owner: z.string().min(1),
    repo: z.string().optional(),
    branch: z.string().optional(),
  }),
})

export type Classroom50Yaml = z.infer<typeof Classroom50YamlSchema>

export function parseClassroom50Yaml(source: string): Classroom50Yaml {
  console.log("source string", source)
  const doc = parseDocument(source, {
    schema: "core",
    prettyErrors: true,
  })

  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map((e) => e.message).join("\n"))
  }

  const raw = doc.toJS()

  return Classroom50YamlSchema.parse(raw)
}
