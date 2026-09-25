export const WORK_ITEM_TEMPLATES = [
  {
    id: "bug",
    name: "🐛 Bug Report",
    defaultItemType: "Bug",
    defaultPriority: "High",
    defaultStoryPoints: 2,
    defaultTags: ["bug", "defect"],
    templateText: `### Summary
[Brief description of the bug]

### Steps to Reproduce
1. Navigate to '...'
2. Click on '...'
3. Observe unexpected behavior

### Expected Result
[What should happen according to specs]

### Actual Result
[What actually happened including error messages or UI glitches]

### Environment
- OS / Browser:
- Service / Version:`,
  },
  {
    id: "user-story",
    name: "📖 User Story",
    defaultItemType: "User Story",
    defaultPriority: "Medium",
    defaultStoryPoints: 5,
    defaultTags: ["story", "frontend", "api"],
    templateText: `### User Story
As a [type of user],
I want [capability or action],
So that [business outcome or benefit].

### Acceptance Criteria
- [ ] AC1: Given [context], when [action], then [outcome]
- [ ] AC2: Form validation triggers when invalid inputs are provided
- [ ] AC3: Loading state and error toasts are displayed properly
- [ ] AC4: Responsive across mobile and desktop

### Definition of Done (DoD)
- [ ] Unit & Integration tests passing
- [ ] PR reviewed & merged to main
- [ ] Deployed to staging environment`,
  },
  {
    id: "epic",
    name: "👑 Epic Architecture",
    defaultItemType: "Epic",
    defaultPriority: "High",
    defaultStoryPoints: 13,
    defaultTags: ["epic", "architecture", "milestone"],
    templateText: `### Epic Overview
[Strategic initiative and business objectives]

### Scope & Milestones
- [ ] Milestone 1: Data model & API endpoints
- [ ] Milestone 2: Frontend views & user interaction
- [ ] Milestone 3: Telemetry, CI/CD automated gates & security auditing

### Key Stakeholders & Impact
- Target Audience:
- Business Value:
- Risks & Mitigations:`,
  },
  {
    id: "feature",
    name: "💡 Feature Specification",
    defaultItemType: "Feature",
    defaultPriority: "Medium",
    defaultStoryPoints: 8,
    defaultTags: ["feature", "enhancement"],
    templateText: `### Feature Description
[Detailed description of what this feature accomplishes]

### Functional Requirements
1. System must allow users to...
2. State must persist across sessions
3. Real-time updates via WebSocket/polling

### Security & Performance
- Authentication / Authorization: Required Bearer Token
- Target Response Time: < 200ms`,
  },
  {
    id: "spike",
    name: "🔬 Technical Spike (Research)",
    defaultItemType: "Task",
    defaultPriority: "Medium",
    defaultStoryPoints: 3,
    defaultTags: ["spike", "research", "poc"],
    templateText: `### Research Objective
[What problem or technology are we evaluating?]

### Timebox
- Time Allocated: 2 days

### Questions to Answer
1. Can this library handle our scale and security needs?
2. What are the integration steps with our current pipeline?

### Deliverable
- Architecture Decision Record (ADR) or Proof-of-Concept branch`,
  },
];
