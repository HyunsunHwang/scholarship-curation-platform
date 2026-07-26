type CorporatePlaceholderProps = {
  title: string;
  description?: string;
};

export default function CorporatePlaceholder({
  title,
  description = "아직 준비 중인 화면입니다.",
}: CorporatePlaceholderProps) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="text-lg font-semibold text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  );
}
