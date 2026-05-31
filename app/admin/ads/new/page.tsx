import Link from "next/link";
import AdForm from "../AdForm";
import { createScholarship } from "../../scholarships/actions";

export default async function NewAdPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/ads"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">광고 추가</h1>
      </div>
      <AdForm
        defaultValues={{ is_advertisement: true, institution_type: "기업", list_on_home: true }}
        action={createScholarship}
        submitLabel="광고 등록"
        returnPath="/admin/ads"
      />
    </div>
  );
}
