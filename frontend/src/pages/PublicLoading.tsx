export const Loading = ({ message = "正在加载刊物内容..." }: { message?: string }) => (
  <p className="results" role="status">
    {message}
  </p>
);
