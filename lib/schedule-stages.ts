/**
 * 주요 일정: 접수 시작/마감은 apply_start_date / apply_end_date 마일스톤으로만 표시한다.
 * stages에 같은 성격이 있으면 중복이므로 추출·표시에서 제외한다.
 */

/** 접수·모집·신청 기간/시작/마감만 가리키는 단계명인지 */
export function isApplyPeriodStageTitle(title: string): boolean {
  const c = title.trim().replace(/\s+/g, "");
  if (!c) return false;

  // 다른 전형·활동이 섞이면 유지 (예: 서류접수 및 면접)
  if (
    /면접|실기|본선|결선|예선|오리엔|활동기간|교육기간|시상|워크숍|캠프|합격자|결과발표|최종발표|서류심사/.test(
      c
    )
  ) {
    return false;
  }

  return (
    /접수시작|모집시작|신청시작|접수마감|모집마감|신청마감/.test(c) ||
    /^(서류|온라인|이메일)?접수(기간)?$/.test(c) ||
    /^(지원|신청|모집)(접수)?기간$/.test(c) ||
    /^(지원|신청|모집)접수$/.test(c) ||
    /^참가신청$/.test(c) ||
    /^접수$/.test(c)
  );
}
