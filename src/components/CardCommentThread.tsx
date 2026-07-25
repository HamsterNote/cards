import type { CardComment } from './CardComments';

interface CommentThreadProps {
  readonly comments: readonly CardComment[];
  readonly parentId: string | null;
  readonly editingCommentId: string | undefined;
  readonly editDraft: string;
  readonly replyToCommentId: string | undefined;
  readonly replyDraft: string;
  readonly onEditDraftChange: (draft: string) => void;
  readonly onReplyDraftChange: (draft: string) => void;
  readonly onEdit: (comment: CardComment) => void;
  readonly onDelete: (commentId: string) => void;
  readonly onReply: (commentId: string) => void;
  readonly onSaveEdit: (commentId: string) => void;
  readonly onSaveReply: (parentId: string) => void;
  readonly onCancel: () => void;
}

export function CardCommentThread({
  comments,
  parentId,
  editingCommentId,
  editDraft,
  replyToCommentId,
  replyDraft,
  onEditDraftChange,
  onReplyDraftChange,
  onEdit,
  onDelete,
  onReply,
  onSaveEdit,
  onSaveReply,
  onCancel,
}: CommentThreadProps) {
  const commentIds = new Set(comments.map((comment) => comment.id));
  const children = comments
    .filter(
      (comment) =>
        comment.parentId === parentId ||
        (parentId === null &&
          comment.parentId !== null &&
          !commentIds.has(comment.parentId))
    )
    .sort((left, right) => left.createdAt - right.createdAt);

  return children.map((comment) => {
    const isEditing = editingCommentId === comment.id;
    const isReplying = replyToCommentId === comment.id;

    return (
      <article className="cards-card-comments__comment" key={comment.id}>
        {isEditing ? (
          <form
            className="cards-card-comments__form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveEdit(comment.id);
            }}
          >
            <textarea
              aria-label="编辑评论"
              className="cards-card-comments__input"
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
            />
            <div className="cards-card-comments__actions">
              <button type="submit">保存</button>
              <button type="button" onClick={onCancel}>
                取消
              </button>
            </div>
          </form>
        ) : (
          <>
            <p
              className="cards-card-comments__content"
              data-card-comment-content
            >
              {comment.content}
            </p>
            <div className="cards-card-comments__meta">
              <time dateTime={new Date(comment.createdAt).toISOString()}>
                {new Date(comment.createdAt).toLocaleString()}
              </time>
              <button type="button" onClick={() => onReply(comment.id)}>
                回复
              </button>
              <button type="button" onClick={() => onEdit(comment)}>
                编辑
              </button>
              <button type="button" onClick={() => onDelete(comment.id)}>
                删除
              </button>
            </div>
          </>
        )}

        {isReplying ? (
          <form
            className="cards-card-comments__form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveReply(comment.id);
            }}
          >
            <textarea
              aria-label="回复评论"
              className="cards-card-comments__input"
              value={replyDraft}
              onChange={(event) => onReplyDraftChange(event.target.value)}
            />
            <div className="cards-card-comments__actions">
              <button type="submit">回复</button>
              <button type="button" onClick={onCancel}>
                取消
              </button>
            </div>
          </form>
        ) : null}

        <div className="cards-card-comments__replies">
          <CardCommentThread
            comments={comments}
            parentId={comment.id}
            editingCommentId={editingCommentId}
            editDraft={editDraft}
            replyToCommentId={replyToCommentId}
            replyDraft={replyDraft}
            onEditDraftChange={onEditDraftChange}
            onReplyDraftChange={onReplyDraftChange}
            onEdit={onEdit}
            onDelete={onDelete}
            onReply={onReply}
            onSaveEdit={onSaveEdit}
            onSaveReply={onSaveReply}
            onCancel={onCancel}
          />
        </div>
      </article>
    );
  });
}
