"use client";

import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Database, Clock, Shield } from "lucide-react";

export default function SettingsPage() {
  const { profile } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" description="System configuration and information" icon={Settings} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Account</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{profile?.full_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{profile?.email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="font-medium">{profile?.role}</span></div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Automation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>The rotation scheduler runs every minute inside the database (pg_cron).</p>
            <p>Ringing rotates after 1 minute. Interested and Call Back rotate after 48 hours.</p>
            <p>Rotation never wraps from the last caller back to the first. Final caller leads go to Admin Review.</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Data</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>All data is stored in a secure PostgreSQL database with row-level security.</p>
            <p>Employees can only see leads assigned to them. Admins have full access.</p>
            <p>Complete assignment and status history is preserved for every lead.</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Security</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Authentication is managed securely through Supabase Auth.</p>
            <p>No credentials are stored in plain text or in the frontend code.</p>
            <p>Role-based access is enforced at the database level, not just the UI.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
