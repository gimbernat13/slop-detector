import { getChannels, getStats, StatsDonut } from "@/features/review";
import { DashboardClient } from "@/features/review/components/DashboardClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch all channels for client-side filtering
  const [channels, stats] = await Promise.all([
    getChannels(),
    getStats(),
  ]);

  const counts = {
    all: stats.slop + stats.suspicious + stats.okay,
    slop: stats.slop,
    suspicious: stats.suspicious,
    okay: stats.okay,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10 w-full">
        <div className="w-full px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                🔍 Slop Detector
              </h1>
              <p className="text-sm text-muted-foreground">
                AI-Powered YouTube Spam Channel Detection
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                <span>{stats.slop} Slop</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full" />
                <span>{stats.suspicious} Suspicious</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span>{stats.okay} Okay</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-8 lg:px-12">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
          {/* Stats Cards */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Classification Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {/* We can import StatsDonut here if needed, or pass it to DashboardClient. 
                    Kept server-side for now as it's static. 
                    Wait, StatsDonut was imported from @/features/review, let's keep it if we can. 
                    I need to re-import StatsDonut here or move it to DashboardClient. 
                    Let's import it.
                */}
                <StatsDonut stats={stats} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Review Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-medium">{stats.pending}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Confirmed</span>
                  <span className="font-medium text-blue-600">{stats.confirmed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overridden</span>
                  <span className="font-medium text-purple-600">{stats.overridden}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Flagged</span>
                  <span className="font-medium text-orange-600">{stats.flagged}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Channel Table */}
          <div className="xl:col-span-4">
            <DashboardClient channels={channels} counts={counts} />
          </div>
        </div>
      </main>
    </div>
  );
}
