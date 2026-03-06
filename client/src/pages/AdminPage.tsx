import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, FlaskConical,
  Loader2, Lock, RefreshCw, RotateCcw, Settings, ShieldAlert, Trash2,
  Unlock, Users, XCircle,
} from "lucide-react";
import { useState } from "react";

export default function AdminPage() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <ShieldAlert className="w-12 h-12 text-slate-400" />
        <p className="text-slate-600 font-medium">请先登录以访问管理后台</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>登录 / Sign In</Button>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <p className="text-slate-800 font-semibold text-lg">权限不足</p>
        <p className="text-slate-500 text-sm">您的账号没有管理员权限。请联系实验负责人提权。</p>
        <p className="text-xs text-slate-400 font-mono bg-slate-100 px-3 py-1 rounded">
          openId: {user?.openId}
        </p>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "participants" | "config" | "export">("overview");

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">V-Norm 实验管理后台</h1>
              <p className="text-xs text-slate-500">Admin Dashboard</p>
            </div>
          </div>
          <a href="/" className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> 被试入口
          </a>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-0">
          {([
            { id: "overview", label: "总览" },
            { id: "participants", label: "被试列表" },
            { id: "config", label: "实验配置" },
            { id: "export", label: "数据导出" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "participants" && <ParticipantsTab />}
        {activeTab === "config" && <ConfigTab />}
        {activeTab === "export" && <ExportTab />}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: sessions, isLoading, refetch } = trpc.dashboard.getSessions.useQuery();
  const { data: coverage } = trpc.dashboard.getItemCoverage.useQuery();
  const { data: configs } = trpc.dashboard.getExperimentConfig.useQuery();

  if (isLoading) return <LoadingSpinner />;

  const total = sessions?.length ?? 0;
  const completed = sessions?.filter((s) => s.status === "completed").length ?? 0;
  const active = sessions?.filter((s) => ["active", "instructions", "consent"].includes(s.status)).length ?? 0;
  const terminated = sessions?.filter((s) => s.status === "terminated").length ?? 0;
  const aoCount = sessions?.filter((s) => s.condition === "AO").length ?? 0;
  const ajCount = sessions?.filter((s) => s.condition === "AJ").length ?? 0;
  const mixCount = sessions?.filter((s) => s.condition === "MIX").length ?? 0;
  const passedAttention = sessions?.filter((s) => s.passedAttentionCheck === true).length ?? 0;
  const failedAttention = sessions?.filter((s) => s.passedAttentionCheck === false).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="总被试" value={total} icon={<Users className="w-5 h-5 text-indigo-500" />} />
        <StatCard label="已完成" value={completed} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} sub={`${total > 0 ? Math.round((completed / total) * 100) : 0}%`} />
        <StatCard label="进行中" value={active} icon={<Loader2 className="w-5 h-5 text-amber-500" />} />
        <StatCard label="已终止" value={terminated} icon={<XCircle className="w-5 h-5 text-red-500" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {configs?.map((cfg) => {
          const count = cfg.condition === "AO" ? aoCount : cfg.condition === "AJ" ? ajCount : mixCount;
          const pct = cfg.targetParticipants > 0 ? Math.min(100, Math.round((count / cfg.targetParticipants) * 100)) : 0;
          const conditionColor = cfg.condition === "AO" ? "border-blue-200" : cfg.condition === "AJ" ? "border-violet-200" : "border-indigo-200";
          return (
            <div key={cfg.condition} className={`bg-white rounded-2xl border p-5 ${conditionColor}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-slate-800">
                    {cfg.condition === "AO" ? "AO 组（仅答案）" : cfg.condition === "AJ" ? "AJ 组（答案+推理）" : "MIX 组（混合 AO+AJ）"}
                  </span>
                  <Badge variant="outline" className={`ml-2 text-xs ${cfg.isOpen ? "border-emerald-400 text-emerald-700" : "border-red-400 text-red-700"}`}>
                    {cfg.isOpen ? "开放中" : "已关闭"}
                  </Badge>
                </div>
                <span className="text-2xl font-bold text-slate-900">
                  {count} <span className="text-sm font-normal text-slate-400">/ {cfg.targetParticipants}</span>
                </span>
              </div>
              <Progress value={pct} className="h-2" />
              <p className="text-xs text-slate-500 mt-1">{pct}% 完成配额</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> 注意力检测（GSM-CHECK）
        </h3>
        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{passedAttention}</p>
            <p className="text-xs text-slate-500">通过</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">{failedAttention}</p>
            <p className="text-xs text-slate-500">未通过</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-400">{completed - passedAttention - failedAttention}</p>
            <p className="text-xs text-slate-500">未作答</p>
          </div>
        </div>
      </div>

      {coverage && coverage.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">题目覆盖情况</h3>
            <button onClick={() => refetch()} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
              <RefreshCw className="w-3.5 h-3.5" /> 刷新
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(["TP", "TN", "FP", "FN"] as const).map((cat) => {
              const items = coverage.filter((i) => i.category === cat);
              return (
                <div key={cat} className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600 uppercase">{cat}</p>
                  {items.map((item) => (
                    <div key={item.itemId} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-12">{item.itemId}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min(100, ((item.countAO + item.countAJ) / (item.targetCount * 2)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{item.countAO}/{item.countAJ}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">格式：AO次数 / AJ次数</p>
        </div>
      )}
    </div>
  );
}

// ─── Participants Tab ─────────────────────────────────────────────────────────
function ParticipantsTab() {
  const utils = trpc.useUtils();
  const { data: sessions, isLoading, refetch } = trpc.dashboard.getSessions.useQuery();

  const releaseParticipant = trpc.dashboard.releaseParticipant.useMutation({
    onSuccess: () => {
      toast.success("配额已释放，该被试记录已删除");
      refetch();
      utils.dashboard.getItemCoverage.invalidate();
    },
    onError: (e) => toast.error(`释放失败: ${e.message}`),
  });

  if (isLoading) return <LoadingSpinner />;

  // Only allow release for non-completed sessions
  const releasable = (status: string) => ["terminated", "consent", "instructions"].includes(status);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">被试列表（{sessions?.length ?? 0} 人）</h3>
        <button onClick={() => refetch()} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs">被试 ID</TableHead>
              <TableHead className="text-xs">实验组</TableHead>
              <TableHead className="text-xs">状态</TableHead>
              <TableHead className="text-xs">进度</TableHead>
              <TableHead className="text-xs">违规次数</TableHead>
              <TableHead className="text-xs">注意力</TableHead>
              <TableHead className="text-xs">用时</TableHead>
              <TableHead className="text-xs">创建时间</TableHead>
              <TableHead className="text-xs">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions?.map((s) => {
              let assignedLen = 0;
              try { assignedLen = (JSON.parse(s.assignedItems as string) as string[]).length; } catch { assignedLen = 0; }
              return (
                <TableRow key={s.participantId} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-xs text-slate-600">{s.participantId}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{s.condition}</Badge></TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-xs text-slate-600">{s.currentIndex} / {assignedLen}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium ${s.violationCount > 0 ? "text-red-600" : "text-slate-400"}`}>{s.violationCount}</span>
                  </TableCell>
                  <TableCell>
                    {s.passedAttentionCheck === null || s.passedAttentionCheck === undefined
                      ? <span className="text-xs text-slate-400">—</span>
                      : s.passedAttentionCheck
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <XCircle className="w-4 h-4 text-red-500" />}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{s.totalTimeSeconds ? `${Math.round(s.totalTimeSeconds / 60)}m` : "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {new Date(s.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    {releasable(s.status) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50" disabled={releaseParticipant.isPending}>
                            <RotateCcw className="w-3 h-3 mr-1" /> 释放配额
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认释放该被试的配额？</AlertDialogTitle>
                            <AlertDialogDescription>
                              将删除被试 <code className="font-mono text-xs bg-slate-100 px-1 rounded">{s.participantId}</code> 的所有记录（session、答题记录、违规记录），并将其占用的题目配额归还题库。
                              <br /><br /><strong>此操作不可撤销。</strong>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={() => releaseParticipant.mutate({ participantId: s.participantId })}>
                              确认释放
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {(!sessions || sessions.length === 0) && (
          <div className="text-center py-12 text-slate-400 text-sm">暂无被试数据</div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-400">"释放配额"仅对已终止或未开始答题的被试可用，将归还其占用的题目名额以供其他被试使用。</p>
      </div>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────
function ConfigTab() {
  const utils = trpc.useUtils();
  const { data: configs, isLoading, refetch } = trpc.dashboard.getExperimentConfig.useQuery();
  const updateConfig = trpc.dashboard.updateConditionConfig.useMutation({
    onSuccess: () => { refetch(); toast.success("配置已更新"); },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });
  const regenerateToken = trpc.dashboard.regenerateToken.useMutation({
    onSuccess: () => { refetch(); toast.success("分享链接已重新生成"); },
    onError: (e) => toast.error(`生成失败: ${e.message}`),
  });
  const resetAllQuotaMut = trpc.dashboard.resetAllQuota.useMutation({
    onSuccess: () => {
      toast.success("全部配额已重置，所有答题记录已清空");
      refetch();
      utils.dashboard.getSessions.invalidate();
      utils.dashboard.getItemCoverage.invalidate();
    },
    onError: (e) => toast.error(`重置失败: ${e.message}`),
  });

  // MIX session management
  const { data: mixStatus, refetch: refetchMix } = trpc.dashboard.getMixStatus.useQuery();
  const generateMixMut = trpc.dashboard.generateMixSessions.useMutation({
    onSuccess: (data) => {
      toast.success(`已生成 ${data.count} 个 MIX session`);
      refetchMix();
      refetch();
    },
    onError: (e) => toast.error(`生成失败: ${e.message}`),
  });
  const generateExtraMixMut = trpc.dashboard.generateExtraMixSessions.useMutation({
    onSuccess: (data) => {
      toast.success(`已额外生成 ${data.count} 个 MIX session`);
      refetchMix();
      refetch();
    },
    onError: (e) => toast.error(`生成失败: ${e.message}`),
  });
  const resetMixMut = trpc.dashboard.resetMixQuota.useMutation({
    onSuccess: () => {
      toast.success("MIX 配额已重置");
      refetchMix();
      refetch();
      utils.dashboard.getSessions.invalidate();
      utils.dashboard.getItemCoverage.invalidate();
    },
    onError: (e) => toast.error(`重置失败: ${e.message}`),
  });
  const [showMixForceConfirm, setShowMixForceConfirm] = useState(false);

  // Single-session release/reset
  const [sessionActionTarget, setSessionActionTarget] = useState<{ participantId: string; action: "release" | "reset" } | null>(null);
  const releaseMixSessionMut = trpc.dashboard.releaseMixSession.useMutation({
    onSuccess: (data) => {
      toast.success(`套题已释放，新 ID: ${data.newParticipantId.slice(0, 8)}…`);
      refetchMix();
      refetch();
      utils.dashboard.getSessions.invalidate();
      utils.dashboard.getItemCoverage.invalidate();
      setSessionActionTarget(null);
    },
    onError: (e) => { toast.error(`释放失败: ${e.message}`); setSessionActionTarget(null); },
  });
  const resetMixSessionMut = trpc.dashboard.resetMixSession.useMutation({
    onSuccess: () => {
      toast.success("套题已重置，被试可重新作答");
      refetchMix();
      refetch();
      utils.dashboard.getSessions.invalidate();
      utils.dashboard.getItemCoverage.invalidate();
      setSessionActionTarget(null);
    },
    onError: (e) => { toast.error(`重置失败: ${e.message}`); setSessionActionTarget(null); },
  });

  const [editingQuota, setEditingQuota] = useState<{ AO?: number; AJ?: number; MIX?: number }>({});

  if (isLoading) return <LoadingSpinner />;

  const origin = window.location.origin;

  return (
    <div className="space-y-5">
      {/* ── Danger zone ── */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-red-800 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> 危险操作：重置全部配额
            </h3>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              清空所有被试的 session、答题记录和违规记录，并将题库中所有题目的 countAO / countAJ 归零。实验配置（配额目标、分享链接）保持不变。<strong>此操作不可撤销，请谨慎使用。</strong>
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 border-red-400 text-red-600 hover:bg-red-100" disabled={resetAllQuotaMut.isPending}>
                {resetAllQuotaMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                重置全部配额
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认重置全部配额？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作将永久删除所有被试的 session、答题记录和违规记录，并将所有题目的 AO/AJ 计数归零。实验配置（目标人数、分享链接）不受影响。
                  <br /><br /><strong>此操作不可撤销，建议先导出数据备份。</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => resetAllQuotaMut.mutate()}>
                  确认重置
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ── Per-condition config ── */}
      {configs?.map((cfg) => {
        const shareUrl = `${origin}/?token=${cfg.inviteToken}`;
        const localQuota = editingQuota[cfg.condition] ?? cfg.targetParticipants;
        return (
          <div key={cfg.condition} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {cfg.condition === "AO" ? "AO 组 — Answer Only" : cfg.condition === "AJ" ? "AJ 组 — Answer + Justification" : "MIX 组 — Mixed AO+AJ"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">当前被试: {cfg.currentParticipants} / 目标: {cfg.targetParticipants}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => updateConfig.mutate({ condition: cfg.condition, isOpen: !cfg.isOpen })}
                className={cfg.isOpen ? "border-red-300 text-red-600 hover:bg-red-50" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"}>
                {cfg.isOpen ? <><Lock className="w-3.5 h-3.5 mr-1" />关闭招募</> : <><Unlock className="w-3.5 h-3.5 mr-1" />开放招募</>}
              </Button>
            </div>

            <Separator className="my-4" />

            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 block mb-2">
                <Settings className="w-3.5 h-3.5 inline mr-1" /> 目标参与人数
              </label>
              <div className="flex items-center gap-3">
                <input type="number" min={1} max={500} value={localQuota}
                  onChange={(e) => setEditingQuota((prev) => ({ ...prev, [cfg.condition]: Number(e.target.value) }))}
                  className="w-24 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <Button size="sm" onClick={() => updateConfig.mutate({ condition: cfg.condition, targetParticipants: localQuota })} disabled={localQuota === cfg.targetParticipants}>
                  保存
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-2">分享链接（{cfg.condition} 组专属）</label>
              {cfg.inviteToken ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 truncate">{shareUrl}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("链接已复制"); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => regenerateToken.mutate({ condition: cfg.condition })} title="重新生成（旧链接将失效）">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => regenerateToken.mutate({ condition: cfg.condition })}>生成分享链接</Button>
              )}
              <p className="text-xs text-slate-400 mt-1.5">被试通过此链接访问时将自动分配到 {cfg.condition} 组。点击刷新图标可重新生成（旧链接立即失效）。</p>
              {cfg.condition === "MIX" && cfg.inviteToken && (mixStatus?.total ?? 0) === 0 && (
                <p className="text-xs text-amber-600 mt-1.5 font-medium">
                  ⚠ MIX 分享链接已生成，但尚未生成 Session。请先在下方"MIX 组 Session 管理"区域点击"生成 16 个 MIX Session"，再将链接发给被试。
                </p>
              )}
            </div>
          </div>
        );
      })}

      {(!configs || configs.length === 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">暂无配置数据，请先通过种子脚本初始化实验配置。</div>
      )}

      {/* ── MIX Session Management ── */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
              MIX 组 Session 管理
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">预先生成 15 个固定 session，每套 16 道数学题（8 AJ + 8 AO）+ 1 道 GSM-CHECK = 17 题，每题每个实验组各标注 3 次</p>
          </div>
          <button onClick={() => refetchMix()} className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "已生成", value: mixStatus?.total ?? 0, color: "text-slate-800" },
            { label: "可用", value: mixStatus?.available ?? 0, color: "text-emerald-600" },
            { label: "已完成", value: mixStatus?.completed ?? 0, color: "text-indigo-600" },
            { label: "已终止", value: mixStatus?.terminated ?? 0, color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Session table */}
        {mixStatus && mixStatus.sessions.length > 0 && (
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">被试ID</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">模板</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">被试编号</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">状态</th>
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {mixStatus.sessions.map((s) => (
                  <tr key={s.participantId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 px-2 font-mono text-slate-600">{s.participantId.slice(0, 8)}…</td>
                    <td className="py-1.5 px-2 text-slate-500">T{s.mixTemplateId}</td>
                    <td className="py-1.5 px-2 text-slate-500">{s.participantCode ?? <span className="text-slate-300">未开始</span>}</td>
                    <td className="py-1.5 px-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-1">
                        <button
                          title="重置：清空答题记录，保留被试ID，被试可用原链接重新作答"
                          onClick={() => setSessionActionTarget({ participantId: s.participantId, action: "reset" })}
                          className="px-1.5 py-0.5 rounded text-amber-600 border border-amber-300 hover:bg-amber-50 text-[10px] font-medium"
                        >
                          重置
                        </button>
                        <button
                          title="释放：清空答题记录，分配新被试ID，原链接失效，可供新被试认领"
                          onClick={() => setSessionActionTarget({ participantId: s.participantId, action: "release" })}
                          className="px-1.5 py-0.5 rounded text-red-600 border border-red-300 hover:bg-red-50 text-[10px] font-medium"
                        >
                          释放
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Single-session action confirm dialog */}
        <AlertDialog open={!!sessionActionTarget} onOpenChange={(open) => { if (!open) setSessionActionTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {sessionActionTarget?.action === "reset" ? "确认重置该套题？" : "确认释放该套题？"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {sessionActionTarget?.action === "reset" ? (
                  <>
                    将清空该套题的所有答题记录和违规记录，并将已计入的题目计数减回。<br />
                    <strong>被试 ID 保持不变，被试可用原链接重新开始作答。</strong><br /><br />
                    被试ID: <code className="bg-slate-100 px-1 rounded">{sessionActionTarget?.participantId}</code>
                  </>
                ) : (
                  <>
                    将清空该套题的所有答题记录和违规记录，并将已计入的题目计数减回。<br />
                    <strong>系统将分配新的被试 ID，原链接失效，该套题可供新被试认领。</strong><br /><br />
                    被试ID: <code className="bg-slate-100 px-1 rounded">{sessionActionTarget?.participantId}</code>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className={sessionActionTarget?.action === "reset" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700"}
                onClick={() => {
                  if (!sessionActionTarget) return;
                  if (sessionActionTarget.action === "reset") {
                    resetMixSessionMut.mutate({ participantId: sessionActionTarget.participantId });
                  } else {
                    releaseMixSessionMut.mutate({ participantId: sessionActionTarget.participantId });
                  }
                }}
              >
                {(releaseMixSessionMut.isPending || resetMixSessionMut.isPending)
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  : null}
                {sessionActionTarget?.action === "reset" ? "确认重置" : "确认释放"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {(mixStatus?.total ?? 0) === 0 ? (
              <Button
              size="sm"
              onClick={() => generateMixMut.mutate({ force: false })}
              disabled={generateMixMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {generateMixMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              生成 15 个 MIX Session
            </Button>
          ) : (
            <>
              <AlertDialog open={showMixForceConfirm} onOpenChange={setShowMixForceConfirm}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-amber-400 text-amber-600 hover:bg-amber-50">
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> 重新生成（删除旧数据）
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认重新生成 MIX Session？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作将删除全部 {mixStatus?.total} 个 MIX session 及其答题记录，并重新生成 15 个新 session。
                      <br /><br /><strong>此操作不可撤销，建议先导出数据备份。</strong>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-amber-500 hover:bg-amber-600"
                      onClick={() => { generateMixMut.mutate({ force: true }); setShowMixForceConfirm(false); }}
                    >
                      确认重新生成
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                size="sm"
                variant="outline"
                className="border-emerald-400 text-emerald-600 hover:bg-emerald-50"
                onClick={() => generateExtraMixMut.mutate({ count: 5 })}
                disabled={generateExtraMixMut.isPending}
              >
                {generateExtraMixMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                +5 额外 Session
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> 重置 MIX 配额
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认重置 MIX 配额？</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除所有 MIX session、答题记录和模板，并将 MIX 条件下所有题目的 countAO/countAJ 减回对应数量。
                      <br /><br /><strong>此操作不可撤销。</strong>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => resetMixMut.mutate()}>
                      确认重置
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export Tab ───────────────────────────────────────────────────────────────
function ExportTab() {
  const { isLoading: jsonLoading, refetch: refetchJson } = trpc.dashboard.exportJSON.useQuery(undefined, { enabled: false });
  const { isLoading: csvLoading, refetch: refetchCsv } = trpc.dashboard.exportCSV.useQuery(undefined, { enabled: false });

  const handleDownloadJSON = async () => {
    const result = await refetchJson();
    if (!result.data) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vnorm_data_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url); toast.success("JSON 数据已下载");
  };

  const handleDownloadCSV = async () => {
    const result = await refetchCsv();
    if (!result.data) return;
    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vnorm_data_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("CSV 数据已下载");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">导出实验数据</h3>
        <p className="text-xs text-slate-500 mb-5">导出包含所有被试的完整答题记录、违规事件和会话元数据。</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleDownloadJSON} disabled={jsonLoading} className="flex items-center gap-2">
            {jsonLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 下载 JSON（完整数据）
          </Button>
          <Button variant="outline" onClick={handleDownloadCSV} disabled={csvLoading} className="flex items-center gap-2">
            {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 下载 CSV（答题记录）
          </Button>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs text-amber-800 font-medium mb-1">数据说明</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>JSON 包含 sessions（会话）、responses（答题记录）、violations（违规事件）三张表</li>
          <li>CSV 包含每道题的作答记录，含被试ID、实验组、题目ID、判断结果、反应时间、Helpfulness评分</li>
          <li>所有被试 ID 均为匿名随机字符串，不含个人信息</li>
          <li>建议在实验结束后统一导出，避免数据不完整</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon, sub }: { label: string; value: number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
      <div className="p-2.5 bg-slate-50 rounded-xl">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}{sub && <span className="text-sm font-normal text-slate-400 ml-1">{sub}</span>}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    consent: { label: "知情同意", className: "bg-slate-100 text-slate-600" },
    instructions: { label: "指导语", className: "bg-blue-100 text-blue-700" },
    active: { label: "答题中", className: "bg-amber-100 text-amber-700" },
    completed: { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
    terminated: { label: "已终止", className: "bg-red-100 text-red-700" },
  };
  const info = map[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.className}`}>{info.label}</span>;
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  );
}
