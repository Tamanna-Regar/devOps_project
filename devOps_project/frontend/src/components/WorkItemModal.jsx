import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { WORK_ITEM_TEMPLATES } from "../utils/templates";

const ITEM_TYPES = [
  { label: "Task", icon: "📋", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  { label: "Bug", icon: "🐛", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
  { label: "Feature", icon: "💡", color: "#7c3aed", bg: "#f3e8ff", border: "#d8b4fe" },
  { label: "Epic", icon: "👑", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  { label: "User Story", icon: "📖", color: "#0d9488", bg: "#ccfbf1", border: "#99f6e4" },
  { label: "Issue", icon: "⚠️", color: "#ca8a04", bg: "#fef9c3", border: "#fde047" },
];

export default function WorkItemModal({
  task,
  onClose,
  onTaskUpdated,
  teamMembers = [],
  sprints = [],
  allTasks = [],
}) {
  const [activeTab, setActiveTab] = useState("details"); // details | hierarchy | comments | attachments | history

  // Form State
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState(task.status || "Pending");
  const [priority, setPriority] = useState(task.priority || "Medium");
  const [itemType, setItemType] = useState(task.item_type || "Task");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to || "");
  const [sprintId, setSprintId] = useState(task.sprint_id || "");
  const [storyPoints, setStoryPoints] = useState(task.story_points ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : "");
  const [tags, setTags] = useState(Array.isArray(task.tags) ? task.tags : []);
  const [newTagInput, setNewTagInput] = useState("");

  // Template & AI Assistant State
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showAiBox, setShowAiBox] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);

  // Hierarchy State
  const [parentId, setParentId] = useState(task.parent_id || "");
  const [children, setChildren] = useState([]);
  const [newChildTitle, setNewChildTitle] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  // Comments State
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Attachments State
  const [attachments, setAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // History State
  const [activityLogs, setActivityLogs] = useState([]);

  // Status/Error
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load Related Data
  const loadHierarchyAndData = useCallback(async () => {
    try {
      const [childRes, comRes, attRes, actRes] = await Promise.all([
        api.getTaskChildren(task.id).catch(() => ({ children: [] })),
        api.getComments(task.id).catch(() => ({ comments: [] })),
        api.getAttachments(task.id).catch(() => ({ attachments: [] })),
        api.getActivityLog(task.id).catch(() => ({ activity: [] })),
      ]);

      setChildren(childRes.children || []);
      setComments(comRes.comments || []);
      setAttachments(attRes.attachments || []);
      setActivityLogs(actRes.activity || []);
    } catch (err) {
      console.error("Error loading work item extra data:", err);
    }
  }, [task.id]);

  useEffect(() => {
    loadHierarchyAndData();
  }, [loadHierarchyAndData]);

  // Handle Save Main Details
  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        item_type: itemType,
        assigned_to: assignedTo || null,
        sprint_id: sprintId || null,
        story_points: storyPoints !== "" ? Number(storyPoints) : null,
        due_date: dueDate || null,
        tags,
      };

      const updated = await api.updateTask(task.id, payload);

      // If parent changed
      if (parentId !== (task.parent_id || "")) {
        await api.setTaskParent(task.id, parentId || null);
      }

      setSuccess("Work item updated successfully!");
      if (onTaskUpdated) onTaskUpdated(updated.task || payload);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update work item");
    } finally {
      setSaving(false);
    }
  };

  // Handle Template Selection
  const handleApplyTemplate = (tmplId) => {
    setSelectedTemplate(tmplId);
    if (!tmplId) return;
    const tmpl = WORK_ITEM_TEMPLATES.find((t) => t.id === tmplId);
    if (!tmpl) return;

    if (description.trim() && !window.confirm(`Replace current description with "${tmpl.name}" template?`)) {
      return;
    }
    setDescription(tmpl.templateText);
    if (tmpl.defaultItemType && (!itemType || itemType === "Task")) {
      setItemType(tmpl.defaultItemType);
    }
    if (tmpl.defaultStoryPoints && (storyPoints === "" || storyPoints === null)) {
      setStoryPoints(tmpl.defaultStoryPoints);
    }
    if (tmpl.defaultTags && tags.length === 0) {
      setTags(tmpl.defaultTags);
    }
    setSuccess(`Template "${tmpl.name}" applied!`);
    setTimeout(() => setSuccess(""), 3000);
  };

  // Handle AI Enhance
  const handleAiEnhance = async () => {
    const promptText = aiPrompt.trim() || title.trim();
    if (!promptText) {
      setError("Please enter a title or prompt for the AI Assistant.");
      return;
    }
    setGeneratingAi(true);
    setError("");
    try {
      const res = await api.aiGenerateWorkItem({
        prompt: promptText,
        item_type: itemType || "Task",
        context: description ? description.slice(0, 500) : undefined,
      });

      if (res.title && (!title || title === "New Work Item")) {
        setTitle(res.title);
      }
      if (res.item_type) {
        setItemType(res.item_type);
      }

      let fullDesc = res.description || "";
      if (Array.isArray(res.acceptance_criteria) && res.acceptance_criteria.length > 0) {
        fullDesc += "\n\n### Acceptance Criteria\n" + res.acceptance_criteria.map((ac) => `- [ ] ${ac}`).join("\n");
      }
      setDescription(fullDesc);

      if (res.story_points !== undefined && res.story_points !== null) {
        setStoryPoints(res.story_points);
      }
      if (res.priority) {
        setPriority(res.priority);
      }
      if (Array.isArray(res.tags) && res.tags.length > 0) {
        const mergedTags = Array.from(new Set([...tags, ...res.tags]));
        setTags(mergedTags);
      }

      setSuccess("Work item enhanced by AI Assistant!");
      setShowAiBox(false);
      setAiPrompt("");
      setTimeout(() => setSuccess(""), 3500);
    } catch (err) {
      setError(err.message || "Failed to generate work item with AI");
    } finally {
      setGeneratingAi(false);
    }
  };

  // Tag Handlers
  const handleAddTag = (e) => {
    if (e.key === "Enter" || e.type === "click") {
      e.preventDefault();
      const val = newTagInput.trim().toLowerCase();
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        setNewTagInput("");
      }
    }
  };

  const handleRemoveTag = (tToRemove) => {
    setTags(tags.filter((t) => t !== tToRemove));
  };

  // Add Comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await api.addComment(task.id, newComment.trim());
      if (res.comment) {
        setComments([...comments, res.comment]);
        setNewComment("");
        // Reload activity
        const actRes = await api.getActivityLog(task.id);
        setActivityLogs(actRes.activity || []);
      }
    } catch (err) {
      setError(err.message || "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  // File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError("");
    try {
      const res = await api.uploadAttachment(task.id, file);
      if (res.attachment) {
        setAttachments([res.attachment, ...attachments]);
        setSuccess(`File "${file.name}" uploaded successfully!`);
        setTimeout(() => setSuccess(""), 3000);
        // Reload activity
        const actRes = await api.getActivityLog(task.id);
        setActivityLogs(actRes.activity || []);
      }
    } catch (err) {
      setError(err.message || "Failed to upload file");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  // Download File
  const handleDownload = async (attachment) => {
    try {
      await api.downloadAttachment(attachment.id, attachment.original_name);
    } catch (err) {
      setError("Failed to download file: " + err.message);
    }
  };

  // Add Child Task
  const handleAddChild = async (e) => {
    e.preventDefault();
    if (!newChildTitle.trim()) return;

    setAddingChild(true);
    try {
      const res = await api.addTask({
        title: newChildTitle.trim(),
        item_type: "Task",
        status: "Pending",
        priority: "Medium",
        sprint_id: sprintId || null,
        parent_id: task.id,
      });

      if (res.task) {
        setChildren([res.task, ...children]);
        setNewChildTitle("");
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      setError(err.message || "Failed to add sub-task");
    } finally {
      setAddingChild(false);
    }
  };

  const currentTypeConfig =
    ITEM_TYPES.find((t) => t.label === itemType) || ITEM_TYPES[0];

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.modalBox}>
        {/* HEADER */}
        <div style={modalStyles.modalHeader}>
          <div style={modalStyles.headerLeft}>
            <span
              style={{
                ...modalStyles.typePill,
                background: currentTypeConfig.bg,
                color: currentTypeConfig.color,
                borderColor: currentTypeConfig.border,
              }}
            >
              {currentTypeConfig.icon} {currentTypeConfig.label}
            </span>
            <span style={modalStyles.itemId}>#{task.id ? task.id.slice(-6).toUpperCase() : ""}</span>
          </div>

          <div style={modalStyles.headerRight}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...modalStyles.saveBtn,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save & Close"}
            </button>
            <button onClick={onClose} style={modalStyles.closeBtn}>
              ✕
            </button>
          </div>
        </div>

        {/* FEEDBACK ALERTS */}
        {error && <div style={modalStyles.alertError}>⚠ {error}</div>}
        {success && <div style={modalStyles.alertSuccess}>✓ {success}</div>}

        {/* EDITABLE TITLE */}
        <div style={modalStyles.titleSection}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Work item title..."
            style={modalStyles.titleInput}
          />
        </div>

        {/* TABS HEADER */}
        <div style={modalStyles.tabsHeader}>
          <button
            onClick={() => setActiveTab("details")}
            style={{
              ...modalStyles.tabBtn,
              ...(activeTab === "details" ? modalStyles.tabBtnActive : {}),
            }}
          >
            📋 Details
          </button>
          <button
            onClick={() => setActiveTab("hierarchy")}
            style={{
              ...modalStyles.tabBtn,
              ...(activeTab === "hierarchy" ? modalStyles.tabBtnActive : {}),
            }}
          >
            🌳 Hierarchy ({children.length})
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            style={{
              ...modalStyles.tabBtn,
              ...(activeTab === "comments" ? modalStyles.tabBtnActive : {}),
            }}
          >
            💬 Discussion ({comments.length})
          </button>
          <button
            onClick={() => setActiveTab("attachments")}
            style={{
              ...modalStyles.tabBtn,
              ...(activeTab === "attachments" ? modalStyles.tabBtnActive : {}),
            }}
          >
            📎 Attachments ({attachments.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            style={{
              ...modalStyles.tabBtn,
              ...(activeTab === "history" ? modalStyles.tabBtnActive : {}),
            }}
          >
            🕒 History ({activityLogs.length})
          </button>
        </div>

        {/* TAB BODY */}
        <div style={modalStyles.tabBody}>
          {/* ==================== DETAILS TAB ==================== */}
          {activeTab === "details" && (
            <div style={modalStyles.detailsLayout}>
              <div style={modalStyles.mainCol}>
                <div style={modalStyles.formGroup}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
                    <label style={{ ...modalStyles.label, margin: 0 }}>Description & Specifications</label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <select
                        value={selectedTemplate}
                        onChange={(e) => handleApplyTemplate(e.target.value)}
                        style={modalStyles.templateSelect}
                        title="Load pre-built Azure DevOps item template"
                      >
                        <option value="">📋 Load Template...</option>
                        {WORK_ITEM_TEMPLATES.map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id}>
                            {tmpl.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAiBox(!showAiBox)}
                        style={modalStyles.aiToggleBtn}
                        title="AI Assistant: auto-generate acceptance criteria and story points"
                      >
                        ✨ AI Assistant
                      </button>
                    </div>
                  </div>

                  {/* AI ASSISTANT BOX */}
                  {showAiBox && (
                    <div style={modalStyles.aiBox}>
                      <div style={modalStyles.aiBoxHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "14px" }}>✨</span>
                          <span style={{ fontWeight: "700", fontSize: "12px", color: "#4338ca" }}>
                            Azure DevOps AI Assistant (Gemini)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAiBox(false)}
                          style={modalStyles.aiCloseBtn}
                        >
                          ✕
                        </button>
                      </div>
                      <p style={{ margin: "4px 0 8px 0", fontSize: "12px", color: "#64748b" }}>
                        Enter a requirement prompt or click Generate to auto-produce structured description, acceptance criteria, story points & tags.
                      </p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          placeholder={`Requirement prompt (defaults to "${title || "task title"}")...`}
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAiEnhance()}
                          style={modalStyles.aiInput}
                        />
                        <button
                          type="button"
                          onClick={handleAiEnhance}
                          disabled={generatingAi}
                          style={modalStyles.aiSubmitBtn}
                        >
                          {generatingAi ? "Generating..." : "Generate ✨"}
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide acceptance criteria, steps to reproduce, or details..."
                    rows={8}
                    style={modalStyles.textarea}
                  />
                </div>

                {/* TAGS SECTION */}
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Tags</label>
                  <div style={modalStyles.tagsContainer}>
                    {tags.map((t, idx) => (
                      <span key={idx} style={modalStyles.tagPill}>
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          style={modalStyles.removeTagBtn}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <div style={modalStyles.addTagRow}>
                      <input
                        type="text"
                        placeholder="+ Add tag..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        style={modalStyles.tagInput}
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        style={modalStyles.addTagBtn}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SIDEBAR COL */}
              <div style={modalStyles.sideCol}>
                <div style={modalStyles.sideCard}>
                  <h4 style={modalStyles.sideTitle}>Attributes</h4>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Item Type</label>
                    <select
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                      style={modalStyles.select}
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t.label} value={t.label}>
                          {t.icon} {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      style={modalStyles.select}
                    >
                      <option value="Pending">📌 To Do / Pending</option>
                      <option value="In Progress">⚡ In Progress</option>
                      <option value="Completed">✅ Done / Completed</option>
                    </select>
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      style={modalStyles.select}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">🔥 Urgent</option>
                    </select>
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Assignee (Team Member)</label>
                    <select
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      style={modalStyles.select}
                    >
                      <option value="">👤 Unassigned</option>
                      {teamMembers.map((m) => (
                        <option key={m.id || m.email} value={m.email}>
                          👤 {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Sprint</label>
                    <select
                      value={sprintId}
                      onChange={(e) => setSprintId(e.target.value)}
                      style={modalStyles.select}
                    >
                      <option value="">📁 Backlog (No Sprint)</option>
                      {sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          🏃 {s.name} ({s.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Story Points</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="e.g. 3, 5, 8"
                      value={storyPoints}
                      onChange={(e) => setStoryPoints(e.target.value)}
                      style={modalStyles.input}
                    />
                  </div>

                  <div style={modalStyles.sideField}>
                    <label style={modalStyles.sideLabel}>Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      style={modalStyles.input}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== HIERARCHY TAB ==================== */}
          {activeTab === "hierarchy" && (
            <div style={modalStyles.hierarchyContent}>
              <div style={modalStyles.parentSection}>
                <h4 style={modalStyles.sectionHeading}>Parent Work Item</h4>
                <p style={modalStyles.helperText}>
                  Link this work item to a parent Feature or Epic to establish full traceability.
                </p>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    style={{ ...modalStyles.select, maxWidth: "400px" }}
                  >
                    <option value="">None (Top-Level Item)</option>
                    {allTasks
                      .filter((t) => t.id !== task.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.item_type || "Task"}] {t.title}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={modalStyles.smallBtn}
                  >
                    Apply Parent Link
                  </button>
                </div>
              </div>

              <div style={modalStyles.childrenSection}>
                <div style={modalStyles.sectionHeaderRow}>
                  <h4 style={modalStyles.sectionHeading}>Child Work Items ({children.length})</h4>
                </div>

                <form onSubmit={handleAddChild} style={modalStyles.addChildForm}>
                  <input
                    type="text"
                    placeholder="Enter new child task title..."
                    value={newChildTitle}
                    onChange={(e) => setNewChildTitle(e.target.value)}
                    style={modalStyles.input}
                  />
                  <button
                    type="submit"
                    disabled={addingChild}
                    style={modalStyles.saveBtn}
                  >
                    {addingChild ? "Adding..." : "+ Add Child Task"}
                  </button>
                </form>

                <div style={modalStyles.childrenList}>
                  {children.length === 0 ? (
                    <div style={modalStyles.emptyBox}>No child work items linked.</div>
                  ) : (
                    children.map((child) => (
                      <div key={child.id} style={modalStyles.childCard}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span style={modalStyles.childType}>[{child.item_type || "Task"}]</span>
                          <span style={modalStyles.childTitle}>{child.title}</span>
                        </div>
                        <span style={modalStyles.childStatus}>{child.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== COMMENTS TAB ==================== */}
          {activeTab === "comments" && (
            <div style={modalStyles.commentsContent}>
              <form onSubmit={handleAddComment} style={modalStyles.newCommentBox}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave a comment or discussion note..."
                  rows={3}
                  style={modalStyles.textarea}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    style={modalStyles.saveBtn}
                  >
                    {submittingComment ? "Posting..." : "💬 Add Comment"}
                  </button>
                </div>
              </form>

              <div style={modalStyles.commentsList}>
                {comments.length === 0 ? (
                  <div style={modalStyles.emptyBox}>No comments yet. Start the conversation!</div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} style={modalStyles.commentCard}>
                      <div style={modalStyles.commentHeader}>
                        <div style={modalStyles.commentAuthorRow}>
                          <span style={modalStyles.avatarCircle}>
                            {(c.author_email || "U")[0].toUpperCase()}
                          </span>
                          <span style={modalStyles.commentAuthor}>{c.author_email}</span>
                        </div>
                        <span style={modalStyles.commentDate}>
                          {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      <div style={modalStyles.commentBody}>{c.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ==================== ATTACHMENTS TAB ==================== */}
          {activeTab === "attachments" && (
            <div style={modalStyles.attachmentsContent}>
              <div style={modalStyles.uploadDropzone}>
                <label style={modalStyles.uploadLabel}>
                  <span style={{ fontSize: "28px" }}>📎</span>
                  <span style={{ fontWeight: "bold", color: "#1e293b" }}>
                    Click or Drag to Upload Attachment
                  </span>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Upload logs, screenshots, error reports, or specifications.
                  </span>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                    disabled={uploadingFile}
                  />
                </label>
                {uploadingFile && <span style={{ color: "#2563eb" }}>Uploading...</span>}
              </div>

              <div style={modalStyles.attachmentsList}>
                {attachments.length === 0 ? (
                  <div style={modalStyles.emptyBox}>No files attached yet.</div>
                ) : (
                  attachments.map((att) => (
                    <div key={att.id} style={modalStyles.attCard}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "24px" }}>📄</span>
                        <div>
                          <div style={modalStyles.attName}>{att.original_name}</div>
                          <div style={modalStyles.attMeta}>
                            {(att.file_size / 1024).toFixed(1)} KB • Uploaded by {att.uploaded_by} on{" "}
                            {new Date(att.uploaded_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(att)}
                        style={modalStyles.downloadBtn}
                      >
                        ⬇ Download
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ==================== HISTORY / ACTIVITY TAB ==================== */}
          {activeTab === "history" && (
            <div style={modalStyles.historyContent}>
              {activityLogs.length === 0 ? (
                <div style={modalStyles.emptyBox}>No activity recorded for this item yet.</div>
              ) : (
                <div style={modalStyles.timeline}>
                  {activityLogs.map((log) => (
                    <div key={log.id} style={modalStyles.timelineItem}>
                      <div style={modalStyles.timelineDot} />
                      <div style={modalStyles.timelineCard}>
                        <div style={modalStyles.timelineMeta}>
                          <span style={modalStyles.timelineUser}>{log.user_email}</span>
                          <span style={modalStyles.timelineTime}>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div style={modalStyles.timelineText}>
                          Updated <strong>{log.field_changed}</strong>
                          {log.old_value !== null && log.old_value !== undefined && (
                            <span> from <code style={modalStyles.code}>{String(log.old_value)}</code></span>
                          )}
                          {log.new_value !== null && log.new_value !== undefined && (
                            <span> to <code style={modalStyles.code}>{String(log.new_value)}</code></span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px",
  },
  modalBox: {
    background: "#ffffff",
    width: "100%",
    maxWidth: "960px",
    maxHeight: "92vh",
    borderRadius: "14px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  typePill: {
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "bold",
    border: "1px solid",
  },
  itemId: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#64748b",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  saveBtn: {
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    fontSize: "18px",
    color: "#64748b",
    cursor: "pointer",
    padding: "4px 8px",
  },
  titleSection: {
    padding: "16px 24px 8px",
  },
  titleInput: {
    width: "100%",
    fontSize: "20px",
    fontWeight: "700",
    color: "#0f172a",
    border: "1px solid transparent",
    borderRadius: "6px",
    padding: "6px 8px",
    outline: "none",
    boxSizing: "border-box",
  },
  tabsHeader: {
    display: "flex",
    gap: "8px",
    padding: "0 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  tabBtn: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "12px 14px",
    fontSize: "13px",
    fontWeight: "600",
    color: "#64748b",
    cursor: "pointer",
  },
  tabBtnActive: {
    color: "#2563eb",
    borderBottomColor: "#2563eb",
  },
  tabBody: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
  },
  detailsLayout: {
    display: "grid",
    gridTemplateColumns: "1fr 300px",
    gap: "24px",
  },
  mainCol: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sideCol: {
    display: "flex",
    flexDirection: "column",
  },
  sideCard: {
    background: "#f8fafc",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sideTitle: {
    margin: "0 0 4px",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#475569",
  },
  sideField: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sideLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#334155",
    marginBottom: "6px",
    display: "block",
  },
  textarea: {
    width: "100%",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    padding: "10px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    background: "#ffffff",
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
  },
  tagsContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
  },
  tagPill: {
    background: "#f1f5f9",
    color: "#334155",
    padding: "3px 8px",
    borderRadius: "14px",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid #cbd5e1",
  },
  removeTagBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "10px",
    color: "#94a3b8",
  },
  addTagRow: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  tagInput: {
    padding: "4px 8px",
    fontSize: "12px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    width: "100px",
  },
  addTagBtn: {
    padding: "4px 8px",
    fontSize: "11px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    background: "#e2e8f0",
    cursor: "pointer",
  },
  alertError: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "10px 24px",
    fontSize: "13px",
    borderBottom: "1px solid #fca5a5",
  },
  alertSuccess: {
    background: "#dcfce7",
    color: "#15803d",
    padding: "10px 24px",
    fontSize: "13px",
    borderBottom: "1px solid #86efac",
  },
  hierarchyContent: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  parentSection: {
    padding: "16px",
    background: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
  },
  sectionHeading: {
    margin: "0 0 6px",
    fontSize: "15px",
    color: "#0f172a",
  },
  helperText: {
    margin: "0 0 12px",
    fontSize: "13px",
    color: "#64748b",
  },
  smallBtn: {
    padding: "8px 14px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
  },
  childrenSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  addChildForm: {
    display: "flex",
    gap: "10px",
  },
  childrenList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  childCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
  },
  childType: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "#0284c7",
  },
  childTitle: {
    fontSize: "14px",
    color: "#1e293b",
  },
  childStatus: {
    fontSize: "12px",
    padding: "2px 8px",
    borderRadius: "12px",
    background: "#f1f5f9",
    color: "#475569",
  },
  emptyBox: {
    padding: "24px",
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "14px",
    border: "1px dashed #cbd5e1",
    borderRadius: "8px",
  },
  commentsContent: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  newCommentBox: {
    background: "#f8fafc",
    padding: "14px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  commentCard: {
    background: "#ffffff",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "12px 16px",
  },
  commentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  commentAuthorRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  avatarCircle: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "#3b82f6",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "bold",
  },
  commentAuthor: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#1e293b",
  },
  commentDate: {
    fontSize: "12px",
    color: "#94a3b8",
  },
  commentBody: {
    fontSize: "14px",
    color: "#334155",
    whiteSpace: "pre-wrap",
    lineHeight: "1.5",
  },
  attachmentsContent: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  uploadDropzone: {
    border: "2px dashed #cbd5e1",
    borderRadius: "8px",
    padding: "24px",
    textAlign: "center",
    background: "#f8fafc",
    cursor: "pointer",
  },
  uploadLabel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
  },
  attachmentsList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  attCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
  },
  attName: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#1e293b",
  },
  attMeta: {
    fontSize: "12px",
    color: "#64748b",
  },
  downloadBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  historyContent: {
    display: "flex",
    flexDirection: "column",
  },
  timeline: {
    position: "relative",
    paddingLeft: "20px",
    borderLeft: "2px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  timelineItem: {
    position: "relative",
  },
  timelineDot: {
    position: "absolute",
    left: "-26px",
    top: "4px",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#3b82f6",
    border: "2px solid #ffffff",
  },
  timelineCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "10px 14px",
  },
  timelineMeta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "#64748b",
    marginBottom: "4px",
  },
  timelineUser: {
    fontWeight: "bold",
    color: "#1e293b",
  },
  timelineTime: {
    color: "#94a3b8",
  },
  timelineText: {
    fontSize: "13px",
    color: "#334155",
  },
  code: {
    background: "#e2e8f0",
    padding: "2px 4px",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "12px",
  },
  templateSelect: {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    background: "#f8fafc",
    color: "#334155",
    cursor: "pointer",
    outline: "none",
  },
  aiToggleBtn: {
    padding: "4px 10px",
    borderRadius: "6px",
    border: "1px solid #818cf8",
    background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
    color: "#4338ca",
    fontWeight: "600",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  aiBox: {
    background: "#f5f3ff",
    border: "1px solid #c7d2fe",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "10px",
  },
  aiBoxHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiCloseBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: "12px",
    padding: "2px 6px",
  },
  aiInput: {
    flex: 1,
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    outline: "none",
  },
  aiSubmitBtn: {
    padding: "7px 14px",
    borderRadius: "6px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "700",
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
