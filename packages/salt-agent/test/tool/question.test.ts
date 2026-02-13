import { describe, it, expect } from "vitest"
import { Question, QuestionTool } from "../../src/tool/question.js"
import { Bus } from "../../src/bus/bus.js"

describe("Question namespace", () => {
  it("Info schema validates", () => {
    const result = Question.Info.parse({
      question: "Do you want to proceed?",
      options: [
        { label: "Yes", description: "Continue" },
        { label: "No" },
      ],
      header: "Confirm",
    })
    expect(result.question).toBe("Do you want to proceed?")
    expect(result.options).toHaveLength(2)
  })

  it("Info schema rejects missing question", () => {
    expect(() =>
      Question.Info.parse({ options: [{ label: "A" }, { label: "B" }] }),
    ).toThrow()
  })

  it("Event types are defined", () => {
    expect(Question.Event.Asked.type).toBe("question.asked")
    expect(Question.Event.Answered.type).toBe("question.answered")
  })

  it("RejectedError is an Error", () => {
    const err = new Question.RejectedError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("拒绝")
  })

  it("ask publishes Asked event and resolves when answered", async () => {
    const sessionID = "ses_qtest"

    // Set up auto-answer
    const unsub = Bus.subscribe(Question.Event.Asked, (event) => {
      setTimeout(() => {
        Bus.publish(Question.Event.Answered, {
          id: event.properties.id,
          sessionID,
          answers: [["Yes"]],
        })
      }, 10)
    })

    const answers = await Question.ask({
      sessionID,
      questions: [
        { question: "Continue?", options: [{ label: "Yes" }, { label: "No" }] },
      ],
    })

    unsub()
    expect(answers).toEqual([["Yes"]])
  })
})

describe("QuestionTool", () => {
  it("has id 'question'", () => {
    expect(QuestionTool.id).toBe("question")
  })

  it("init returns tool info", async () => {
    const info = await QuestionTool.init()
    expect(info.description).toContain("问题")
    expect(info.parameters).toBeDefined()
  })
})
