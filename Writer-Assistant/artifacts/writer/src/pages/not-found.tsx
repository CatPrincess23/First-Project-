import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-muted-foreground">
            That page doesn’t exist. Head back to your documents and keep writing.
          </p>
          <Button asChild className="mt-5">
            <Link href="/documents"><ArrowLeft className="mr-2 h-4 w-4" />Back to documents</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
