import { Hono } from "hono"
import { Question } from "../../tool/question.js"
import { Bus } from "../../bus/bus.js"
import { lazy } from "../../util/lazy.js"

export const QuestionRoutes = lazy(() =>
  new Hono()
    // -----------------------------------------------------------------------
    // List pending questions
    // -----------------------------------------------------------------------
    .get("/", async (c) => {
      // Question doesn't have a list() — return empty for now
      // Pending questions are tracked in-memory by the Question module
      return c.json([])
    })

    // -----------------------------------------------------------------------
    // Reply to question
    // -----------------------------------------------------------------------
    .post("/:requestID/reply", async (c) => {
      const requestID = c.req.param("requestID")
      const body = await c.req.json<{ answers: string[][] }>()
      Bus.publish(Question.Event.Answered, {
        id: requestID,
        sessionID: "",
        answers: body.answers,
      })
      return c.json(true)
    })

    // -----------------------------------------------------------------------
    // Reject question
    // -----------------------------------------------------------------------
    .post("/:requestID/reject", async (c) => {
      // For now, rejecting publishes an empty answer
      const requestID = c.req.param("requestID")
      Bus.publish(Question.Event.Answered, {
        id: requestID,
        sessionID: "",
        answers: [],
      })
      return c.json(true)
    }),
)
