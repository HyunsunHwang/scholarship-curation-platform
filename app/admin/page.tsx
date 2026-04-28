import Link from "next/link";

const cards = [
  {
    href: "/admin/scholarships",
    title: "장학금 관리",
    description: "등록된 장학금을 조회·추가·수정합니다.",
  },
  {
    href: "/admin/site-settings",
    title: "사이트 설정",
    description: "메인 헤더에 표시되는 로고 이미지를 변경합니다.",
  },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
      <p className="text-sm text-gray-500 mt-1 mb-8">
        관리 메뉴에서 작업을 선택하세요.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-brand/30"
            >
              <h2 className="text-lg font-semibold text-gray-900">{c.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{c.description}</p>
              <span className="inline-block mt-3 text-sm font-medium text-brand">
                이동 →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
