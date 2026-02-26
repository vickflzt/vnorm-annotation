import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Download,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function DashboardPage() {
  const { user, isAuthenticated, loading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } =
    trpc.dashboard.getSessions.useQuery(undefined, {
      enabled: isAuthenticated && user?.role === "admin",
    });

  const { data: coverage, isLoading: coverageLoading, refetch: refetchCoverage } =
    trpc.dashboard.getItemCoverage.useQuery(undefined, {
      enabled: isAuthenticated && user?.role === "admin",
    });

  const { data: exportData } = trpc.dashboard.exportJSON.useQuery(undefined, {
    enabled: false,
  });
  const exportJSONQuery = trpc.dashboard.exportJSON.useQuery(undefined, {
    enabled: false,
  });
  const exportCSVQuery = trpc.dashboard.exportCSV.useQuery(undefined, {
    enabled: false,
  });

  const handleRefresh = () => {
    refetchSessions();
    refetchCoverage();
    setRefreshKey((k) => k + 1);
    toast.success("数据已刷新");
  };

  const handleExportJSON = async () => {
    const result = await exportJSONQuery.refetch();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vnorm_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON 导出成功");
    }
  };

  const handleExportCSV = async () => {
    const result = await exportCSVQuery.refetch();
    if (result.data) {
      const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vnorm_responses_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV 导出成功");
    }
  };

  // Auth guard
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">实验者登录</h2>
          <p className="text-sm text-slate-600">请登录以访问实验者看板</p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            登录 / Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">权限不足</h2>
          <p className="text-sm text-slate-600">此页面仅限实验管理员访问。</p>
        </div>
      </div>
    );
  }

  // Stats
  const totalSessions = sessions?.length ?? 0;
  const completedSessions = sessions?.filter((s) => s.status === "completed").length ?? 0;
  const terminatedSessions = sessions?.filter((s) => s.status === "terminated").length ?? 0;
  const activeSessions = sessions?.filter((s) => s.status === "active").length ?? 0;
  const aoSessions = sessions?.filter((s) => s.condition === "AO").length ?? 0;
  const ajSessions = sessions?.filter((s) => s.condition === "AJ").length ?? 0;

  // Coverage stats
  const totalItems = coverage?.length ?? 0;
  const aoComplete = coverage?.filter((c) => c.countAO >= c.targetCount).length ?? 0;
  const ajComplete = coverage?.filter((c) => c.countAJ >= c.targetCount).length ?? 0;

  // Chart data for coverage
  const categoryGroups = ["TP", "TN", "FP", "FN"];
  const coverageChartData = categoryGroups.map((cat) => {
    const items = coverage?.filter((c) => c.category === cat) ?? [];
    const avgAO = items.length ? items.reduce((s, i) => s + i.countAO, 0) / items.length : 0;
    const avgAJ = items.length ? items.reduce((s, i) => s + i.countAJ, 0) / items.length : 0;
    return { category: cat, AO: Math.round(avgAO * 10) / 10, AJ: Math.round(avgAJ * 10) / 10 };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">V</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">实验者看板</h1>
              <p className="text-xs text-slate-500">V-Norm Annotation — Experimenter Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-1.5" />
              导出 CSV
            </Button>
            <Button size="sm" onClick={handleExportJSON} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Download className="w-4 h-4 mr-1.5" />
              导出 JSON
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-5 h-5 text-indigo-600" />}
            label="总被试数"
            value={totalSessions}
            sub={`AO: ${aoSessions} · AJ: ${ajSessions}`}
            color="indigo"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            label="已完成"
            value={completedSessions}
            sub={`${totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0}% 完成率`}
            color="emerald"
          />
          <StatCard
            icon={<BarChart3 className="w-5 h-5 text-blue-600" />}
            label="进行中"
            value={activeSessions}
            sub="active sessions"
            color="blue"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            label="已终止"
            value={terminatedSessions}
            sub="violation terminated"
            color="red"
          />
        </div>

        {/* Coverage progress */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">题目覆盖进度 / Item Coverage</h2>
            <span className="text-xs text-slate-500">目标: 每题 AO×3 + AJ×3</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">AO 条件覆盖</span>
                <span className="font-medium text-slate-900">{aoComplete} / {totalItems}</span>
              </div>
              <Progress value={totalItems ? (aoComplete / totalItems) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">AJ 条件覆盖</span>
                <span className="font-medium text-slate-900">{ajComplete} / {totalItems}</span>
              </div>
              <Progress value={totalItems ? (ajComplete / totalItems) * 100 : 0} className="h-2" />
            </div>
          </div>

          {/* Bar chart */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageChartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 3]} />
                <Tooltip />
                <Bar dataKey="AO" fill="#6366f1" name="AO avg" radius={[3, 3, 0, 0]} />
                <Bar dataKey="AJ" fill="#22c55e" name="AJ avg" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sessions table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">被试列表 / Participant Sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Participant ID</TableHead>
                  <TableHead className="text-xs">条件</TableHead>
                  <TableHead className="text-xs">状态</TableHead>
                  <TableHead className="text-xs">进度</TableHead>
                  <TableHead className="text-xs">违规次数</TableHead>
                  <TableHead className="text-xs">注意力检测</TableHead>
                  <TableHead className="text-xs">总用时</TableHead>
                  <TableHead className="text-xs">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sessions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-400 text-sm">
                      暂无被试数据
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions?.map((s) => {
                    const assignedItems = JSON.parse(s.assignedItems as string) as string[];
                    const progress = `${s.currentIndex} / ${assignedItems.length}`;
                    const pct = assignedItems.length
                      ? Math.round((s.currentIndex / assignedItems.length) * 100)
                      : 0;
                    return (
                      <TableRow key={s.participantId} className="hover:bg-slate-50">
                        <TableCell className="font-mono text-xs text-slate-600">
                          {s.participantId}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              s.condition === "AO"
                                ? "border-indigo-300 text-indigo-700 bg-indigo-50"
                                : "border-emerald-300 text-emerald-700 bg-emerald-50"
                            }
                          >
                            {s.condition}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-600">{progress}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-medium ${
                              s.violationCount > 0 ? "text-red-600" : "text-slate-500"
                            }`}
                          >
                            {s.violationCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          {s.passedAttentionCheck === null || s.passedAttentionCheck === undefined ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : s.passedAttentionCheck ? (
                            <span className="text-xs text-emerald-600 font-medium">✓ 通过</span>
                          ) : (
                            <span className="text-xs text-red-600 font-medium">✗ 未通过</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {s.totalTimeSeconds
                            ? `${Math.round(s.totalTimeSeconds / 60)} min`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(s.createdAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Item-level coverage table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">题目级别覆盖 / Per-Item Coverage</h2>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Item ID</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">AO Count</TableHead>
                  <TableHead className="text-xs">AJ Count</TableHead>
                  <TableHead className="text-xs">Target</TableHead>
                  <TableHead className="text-xs">AO 进度</TableHead>
                  <TableHead className="text-xs">AJ 进度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-slate-400" />
                    </TableCell>
                  </TableRow>
                ) : (
                  coverage?.map((item) => (
                    <TableRow key={item.itemId} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-xs font-medium text-slate-700">
                        {item.itemId}
                      </TableCell>
                      <TableCell>
                        <CategoryBadge category={item.category} />
                      </TableCell>
                      <TableCell className="text-xs">{item.countAO}</TableCell>
                      <TableCell className="text-xs">{item.countAJ}</TableCell>
                      <TableCell className="text-xs text-slate-500">{item.targetCount}</TableCell>
                      <TableCell>
                        <MiniProgress value={item.countAO} max={item.targetCount} color="indigo" />
                      </TableCell>
                      <TableCell>
                        <MiniProgress value={item.countAJ} max={item.targetCount} color="emerald" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  const bg: Record<string, string> = {
    indigo: "bg-indigo-50",
    emerald: "bg-emerald-50",
    blue: "bg-blue-50",
    red: "bg-red-50",
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div className={`w-9 h-9 ${bg[color]} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-600 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    consent: { label: "同意中", class: "bg-slate-100 text-slate-600" },
    instructions: { label: "阅读指导", class: "bg-blue-100 text-blue-700" },
    active: { label: "答题中", class: "bg-amber-100 text-amber-700" },
    completed: { label: "已完成", class: "bg-emerald-100 text-emerald-700" },
    terminated: { label: "已终止", class: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, class: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.class}`}>
      {s.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, string> = {
    TP: "bg-emerald-100 text-emerald-700",
    TN: "bg-blue-100 text-blue-700",
    FP: "bg-amber-100 text-amber-700",
    FN: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded ${map[category] ?? "bg-slate-100 text-slate-600"}`}>
      {category}
    </span>
  );
}

function MiniProgress({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = color === "indigo" ? "bg-indigo-500" : "bg-emerald-500";
  const done = value >= max;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${done ? "bg-emerald-500" : barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs ${done ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
        {value}/{max}
      </span>
    </div>
  );
}
