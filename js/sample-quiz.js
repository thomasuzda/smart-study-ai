/* ==========================================================================
   sample-quiz.js — placeholder quiz data
   --------------------------------------------------------------------------
   These ten questions exist so the quiz engine is fully testable before any
   accounts or AI exist. Once the AI generates real quizzes, they'll arrive in
   EXACTLY this shape — so nothing in quiz.js has to change.

   The shape of one question:
     id           a unique string, so we can track answers reliably
     type         "multiple_choice" or "true_false" (true/false is just a
                  2-option multiple choice, so one shape covers both)
     question     the question text
     options      the answer choices, in display order
     correctIndex which option is right, as a position in the array (0 = first)
     explanation  shown after answering — this is the part that teaches

   Why correctIndex instead of storing the answer's text? Because comparing
   numbers can never break. Comparing strings breaks the moment there's a
   stray space, a different capital letter, or an "A)" prefix on one side.
   ========================================================================== */

const SAMPLE_QUIZ = {
  title: "General Knowledge Sample",
  subject: "Mixed",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      question: "What does HTML stand for?",
      options: [
        "HyperText Markup Language",
        "HighTech Modern Language",
        "HyperTool Multi Language",
        "Home Text Markup Layout",
      ],
      correctIndex: 0,
      explanation:
        "HTML is HyperText Markup Language. It describes the structure of a web page — headings, paragraphs, buttons — while CSS handles how it looks.",
    },
    {
      id: "q2",
      type: "multiple_choice",
      question: "Which part of a web page controls how things look?",
      options: ["HTML", "CSS", "JavaScript", "JSON"],
      correctIndex: 1,
      explanation:
        "CSS (Cascading Style Sheets) controls appearance: colors, spacing, fonts, layout. HTML is the content, JavaScript is the behavior.",
    },
    {
      id: "q3",
      type: "true_false",
      question: "A GitHub repository stores both your files and their history.",
      options: ["True", "False"],
      correctIndex: 0,
      explanation:
        "True. That history is the whole point of a repository — every saved change (commit) is kept, so you can compare versions or undo one.",
    },
    {
      id: "q4",
      type: "multiple_choice",
      question: "What does it mean to 'commit' in Git?",
      options: [
        "Upload files to the internet",
        "Delete old versions of a file",
        "Save a checkpoint of your changes with a message",
        "Share your project with another person",
      ],
      correctIndex: 2,
      explanation:
        "A commit is a saved checkpoint plus a short message describing what changed. Uploading that checkpoint to GitHub is a separate step, called a push.",
    },
    {
      id: "q5",
      type: "multiple_choice",
      question: "Which planet in our solar system is the largest?",
      options: ["Saturn", "Neptune", "Earth", "Jupiter"],
      correctIndex: 3,
      explanation:
        "Jupiter. It's about 11 times Earth's diameter — more massive than every other planet in the solar system combined.",
    },
    {
      id: "q6",
      type: "true_false",
      question: "Water boils at the same temperature at every altitude.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation:
        "False. Higher altitude means lower air pressure, so water boils cooler — around 202°F in Denver instead of 212°F at sea level. That's why high-altitude recipes need adjusting.",
    },
    {
      id: "q7",
      type: "multiple_choice",
      question: "What is the powerhouse of the cell?",
      options: ["Nucleus", "Mitochondria", "Ribosome", "Cell membrane"],
      correctIndex: 1,
      explanation:
        "Mitochondria. They convert nutrients into ATP, the molecule cells actually spend as energy.",
    },
    {
      id: "q8",
      type: "multiple_choice",
      question: "In math, what is the value of 7 × 8?",
      options: ["54", "56", "63", "48"],
      correctIndex: 1,
      explanation: "7 × 8 = 56. A useful anchor: 7 × 8 is 8 less than 8 × 8 (64).",
    },
    {
      id: "q9",
      type: "multiple_choice",
      question: "Who wrote the play 'Romeo and Juliet'?",
      options: [
        "Charles Dickens",
        "Jane Austen",
        "William Shakespeare",
        "Mark Twain",
      ],
      correctIndex: 2,
      explanation:
        "William Shakespeare, around 1595. It's one of his tragedies, alongside Hamlet and Macbeth.",
    },
    {
      id: "q10",
      type: "true_false",
      question: "An API key should be written directly into a website's code.",
      options: ["True", "False"],
      correctIndex: 1,
      explanation:
        "False, and this one matters for this app. Anything in a web page can be read by anyone who views the source — so a key there can be stolen and used at your expense. Keys belong on a server the browser can't read.",
    },
  ],
};
