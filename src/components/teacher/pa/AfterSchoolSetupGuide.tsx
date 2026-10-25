import Link from "next/link";

export function AfterSchoolSetupGuide() {
  return (
    <details className="border rounded-lg p-4 text-sm space-y-3 [overflow-wrap:anywhere]">
      <summary className="font-semibold cursor-pointer">
        設定教學：Google只讀憑證及排程器
      </summary>
      <ol className="list-decimal pl-5 space-y-2 mt-3">
        <li>
          在Google Cloud專案啟用Google Sheets API及Google Drive
          API，於「IAM與管理 →
          服務帳戶」建立課後班專用帳戶。無須授予專案Owner／Editor。
        </li>
        <li>
          開啟服務帳戶的「金鑰 → 新增金鑰 → 建立新金鑰 →
          JSON」。在伺服器秘密環境變數AFTERSCHOOL_GOOGLE_SERVICE_ACCOUNT_JSON放入完整JSON；不要在此頁或聊天室提交私鑰。
        </li>
        <li>
          複製JSON的client_email，在原始試算表「共用」加入該電郵，選「檢視者」。不必發布到網絡，也不必啟用全網域委派。新學年換原檔時須再分享一次。
        </li>
        <li>
          在本頁填連結、實際分頁名稱及學年年份，先保持自動流程停用，到行政公告的「手動預覽」核對學生、日期、地點和時間。
        </li>
        <li>
          伺服器另設至少32字元的隨機AFTERSCHOOL_CRON_SECRET，以及既有VAPID公私鑰。排程器只保管排程密鑰，不需要Google私鑰。
        </li>
        <li>
          外部排程器每分鐘POST下列網址；加入Authorization標頭，值為Bearer加一個空格再加排程密鑰。Google
          Cloud
          Scheduler可用HTTP目標及自訂標頭；不要選OIDC/OAuth自動產生的token，這個端點驗證的是獨立排程密鑰。
        </li>
      </ol>
      <dl className="mt-3 space-y-1">
        <dt className="font-semibold">網址</dt>
        <dd className="break-all">
          https://teacher.keichi.edu.hk/api/cron/after-school
        </dd>
        <dt className="font-semibold">頻率／時區／方法</dt>
        <dd>
          <code>* * * * *</code> ／ Asia/Hong_Kong ／ POST
        </dd>
        <dt className="font-semibold">標頭</dt>
        <dd>
          <code>Authorization: Bearer &lt;AFTERSCHOOL_CRON_SECRET&gt;</code>
        </dd>
      </dl>
      <p className="mt-3">
        完成配置及預覽後，勾選自動批核授權並啟用流程。06:00整理、07:00公告、08:15首次提醒；星期一14:00／二至五15:45再提醒。啟用勾選不會自行建立外部排程工作。
      </p>
      <p>
        若學校政策禁止建立JSON金鑰或分享給服務帳戶，請由Google
        Workspace管理員確認允許的連線方式。
      </p>
      <p className="mt-3 flex flex-wrap gap-3">
        <a
          className="underline"
          href="https://docs.cloud.google.com/iam/docs/keys-create-delete"
          target="_blank"
          rel="noreferrer"
        >
          Google金鑰教學
        </a>
        <a
          className="underline"
          href="https://developers.google.com/workspace/guides/create-credentials"
          target="_blank"
          rel="noreferrer"
        >
          Google文件分享及憑證
        </a>
        <a
          className="underline"
          href="https://docs.cloud.google.com/scheduler/docs/creating"
          target="_blank"
          rel="noreferrer"
        >
          Cloud Scheduler教學
        </a>
        <Link
          className="underline"
          href="/teacher/committee/admin/pa-announcements"
        >
          前往行政公告預覽
        </Link>
      </p>
    </details>
  );
}
