import { useId, useState } from 'react';
import './CardComments.css';
import { CardCommentThread } from './CardCommentThread';

export interface CardComment {
  readonly id: string;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt?: number;
  readonly parentId: string | null;
}

interface CardCommentsProps {
  readonly comments: readonly CardComment[];
  readonly onCommentsChange: (comments: readonly CardComment[]) => void;
}

function createCommentId(): string {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function CardComments({
  comments,
  onCommentsChange,
}: CardCommentsProps) {
  const [newCommentDraft, setNewCommentDraft] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState<string>();
  const [replyDraft, setReplyDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string>();
  const [editDraft, setEditDraft] = useState('');
  const newCommentInputId = useId();

  const resetActiveForm = () => {
    setReplyToCommentId(undefined);
    setReplyDraft('');
    setEditingCommentId(undefined);
    setEditDraft('');
  };

  const addComment = (content: string, parentId: string | null) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    onCommentsChange([
      ...comments,
      {
        id: createCommentId(),
        content: trimmedContent,
        createdAt: Date.now(),
        parentId,
      },
    ]);
    resetActiveForm();
  };

  const updateComment = (commentId: string) => {
    const trimmedContent = editDraft.trim();
    if (!trimmedContent) return;

    onCommentsChange(
      comments.map((comment) =>
        comment.id === commentId
          ? { ...comment, content: trimmedContent, updatedAt: Date.now() }
          : comment
      )
    );
    resetActiveForm();
  };

  const deleteComment = (commentId: string) => {
    const deletedCommentIds = new Set([commentId]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (const comment of comments) {
        if (
          comment.parentId !== null &&
          deletedCommentIds.has(comment.parentId) &&
          !deletedCommentIds.has(comment.id)
        ) {
          deletedCommentIds.add(comment.id);
          foundChild = true;
        }
      }
    }

    onCommentsChange(
      comments.filter((comment) => !deletedCommentIds.has(comment.id))
    );
    resetActiveForm();
  };

  return (
    <section className="cards-card-comments" data-card-comment-panel>
      <form
        className="cards-card-comments__form"
        onSubmit={(event) => {
          event.preventDefault();
          addComment(newCommentDraft, null);
          setNewCommentDraft('');
        }}
      >
        <label
          className="cards-card-comments__label"
          htmlFor={newCommentInputId}
        >
          添加评论
        </label>
        <textarea
          className="cards-card-comments__input"
          data-card-comment-input
          id={newCommentInputId}
          value={newCommentDraft}
          onChange={(event) => setNewCommentDraft(event.target.value)}
        />
        <div className="cards-card-comments__actions">
          <button data-card-comment-submit type="submit">
            发布评论
          </button>
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="cards-card-comments__empty">暂无评论</p>
      ) : (
        <div className="cards-card-comments__list">
          <CardCommentThread
            comments={comments}
            parentId={null}
            editingCommentId={editingCommentId}
            editDraft={editDraft}
            replyToCommentId={replyToCommentId}
            replyDraft={replyDraft}
            onEditDraftChange={setEditDraft}
            onReplyDraftChange={setReplyDraft}
            onEdit={(comment) => {
              setEditingCommentId(comment.id);
              setEditDraft(comment.content);
              setReplyToCommentId(undefined);
              setReplyDraft('');
            }}
            onDelete={deleteComment}
            onReply={(commentId) => {
              setReplyToCommentId(commentId);
              setReplyDraft('');
              setEditingCommentId(undefined);
              setEditDraft('');
            }}
            onSaveEdit={updateComment}
            onSaveReply={(parentId) => addComment(replyDraft, parentId)}
            onCancel={resetActiveForm}
          />
        </div>
      )}
    </section>
  );
}
