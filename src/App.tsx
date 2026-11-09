import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Permission } from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { DashboardPage } from "@/pages/dashboard";
import { StudentsPage } from "@/pages/students/students-page";
import { StudentProfilePage } from "@/pages/students/student-profile";
import { GroupsPage } from "@/pages/groups/groups-page";
import { GroupDetailPage } from "@/pages/groups/group-detail";
import { JournalPage } from "@/pages/journal/journal-page";
import { TeachersPage } from "@/pages/teachers/teachers-page";
import { StatementsPage } from "@/pages/finance/statements-page";
import { ActsPage } from "@/pages/finance/acts-page";
import { PaymentsPage } from "@/pages/finance/payments-page";
import { AddendumsPage } from "@/pages/documents/addendums-page";
import { SettingsPage } from "@/pages/system/settings-page";
import { AuditPage } from "@/pages/system/audit-page";

function Guard({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const role = useAppStore((s) => s.role);
  const navigate = useNavigate();
  if (!can(role, permission)) {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="Нет доступа"
        description="Ваша роль не позволяет открыть этот раздел. Обратитесь к администратору, чтобы расширить права."
        action={<Button onClick={() => navigate("/")}>На дашборд</Button>}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="students" element={<Guard permission="students.view"><StudentsPage /></Guard>} />
          <Route path="students/:id" element={<Guard permission="students.view"><StudentProfilePage /></Guard>} />
          <Route path="groups" element={<Guard permission="groups.view"><GroupsPage /></Guard>} />
          <Route path="groups/:id" element={<Guard permission="groups.view"><GroupDetailPage /></Guard>} />
          <Route path="journal" element={<Guard permission="journal.view"><JournalPage /></Guard>} />
          <Route path="teachers" element={<Guard permission="teachers.view"><TeachersPage /></Guard>} />
          <Route path="statements" element={<Guard permission="finance.view"><StatementsPage /></Guard>} />
          <Route path="payments" element={<Guard permission="finance.view"><PaymentsPage /></Guard>} />
          <Route path="acts" element={<Guard permission="acts.view"><ActsPage /></Guard>} />
          <Route path="addendums" element={<Guard permission="documents.view"><AddendumsPage /></Guard>} />
          <Route path="settings" element={<Guard permission="settings.view"><SettingsPage /></Guard>} />
          <Route path="audit" element={<Guard permission="audit.view"><AuditPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
