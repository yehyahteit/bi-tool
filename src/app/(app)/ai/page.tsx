import { Sparkles } from 'lucide-react';

export default function AIPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-purple-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Assistant</h1>
      <p className="text-gray-500 max-w-md">
        The AI assistant is coming in Phase 6. It will automatically summarize your data,
        suggest charts, detect anomalies, and generate full dashboards from a single prompt.
      </p>
      <div className="mt-8 px-5 py-3 rounded-xl bg-purple-50 border border-purple-100 text-sm text-purple-700 font-medium">
        Coming soon — OpenAI / Azure OpenAI integration
      </div>
    </div>
  );
}
