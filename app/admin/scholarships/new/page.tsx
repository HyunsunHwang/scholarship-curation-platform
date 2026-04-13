import Link from "next/link";
import ScholarshipForm from "../ScholarshipForm";
import { createScholarship } from "../actions";

export default function NewScholarshipPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/scholarships"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">장학금 추가</h1>
      </div>
      <ScholarshipForm action={createScholarship} submitLabel="장학금 등록" />
    </div>
  );
}
