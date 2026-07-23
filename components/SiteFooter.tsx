type SiteFooterProps = {
  className?: string;
  contentClassName?: string;
};

export default function SiteFooter({
  className = "",
  contentClassName = "",
}: SiteFooterProps) {
  return (
    <footer
      className={`border-t border-gray-200/80 bg-white py-6 ${className}`}
    >
      <div
        className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${contentClassName}`}
      >
        <div className="space-y-1 text-xs leading-relaxed text-ink/55 sm:text-sm">
          <p>
            이루리(IRURI) <span aria-hidden>|</span> 서울특별시 성북구 안암로 145,
            경영본관 220호
          </p>
          <p>대표: 황현선</p>
          <p>
            문의:{" "}
            <a
              href="mailto:iruri.career@gmail.com"
              className="font-medium text-brand hover:underline"
            >
              iruri.career@gmail.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
