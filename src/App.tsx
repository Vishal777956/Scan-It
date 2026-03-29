import { useState, useRef, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, AlertTriangle, CheckCircle, Info, Loader2, Clock, X, Leaf, ThumbsDown, ThumbsUp, ArrowRight, Download } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { ScrollArea } from "./components/ui/scroll-area";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Ingredient {
  name: string;
  simpleName: string;
  description: string;
  healthImpact: "Positive" | "Neutral" | "Negative";
  reasoning: string;
}

interface Alternative {
  productName: string;
  reason: string;
}

interface ScanResult {
  productName: string;
  ingredients: Ingredient[];
  summary: string;
  overallSafety: "Safe" | "Moderate" | "Harmful";
  healthierAlternatives: Alternative[];
}

interface ScanHistory {
  _id: string;
  ingredients: string;
  harmfulIngredients: string[];
  summary: string;
  timestamp: string;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanHistory[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/scans");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);

    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Upgraded to Pro for more reliable, research-backed analysis
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: "Analyze this product image. If it shows an ingredient label, extract the ingredients. If it shows a barcode or product packaging, identify the product and determine its typical ingredients using Google Search. For each ingredient, provide its simple common name, a brief description, its health impact ('Positive', 'Neutral', or 'Negative'), and a scientific/nutritional reasoning for this impact. Also provide a guessed product name, an overall safety assessment, and suggest 1-3 specific healthier alternative products available in the market with a reason why they are better. If no ingredients can be found, return an empty array for ingredients and explain in the summary.",
            },
          ],
        },
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: {
                type: Type.STRING,
                description: "Guessed name of the product based on the label or barcode, or 'Unknown Product'",
              },
              ingredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Exact name on the label" },
                    simpleName: { type: Type.STRING, description: "Simplified common name" },
                    description: { type: Type.STRING, description: "Brief description of the ingredient's purpose" },
                    healthImpact: { 
                      type: Type.STRING, 
                      description: "Health impact category",
                      enum: ["Positive", "Neutral", "Negative"]
                    },
                    reasoning: { type: Type.STRING, description: "Scientific or nutritional reason for the health impact rating" },
                  },
                  required: ["name", "simpleName", "description", "healthImpact", "reasoning"],
                },
              },
              summary: {
                type: Type.STRING,
                description: "A brief 1-2 sentence summary of the product's overall ingredient quality or an explanation if ingredients couldn't be found.",
              },
              overallSafety: {
                type: Type.STRING,
                description: "Overall safety rating",
                enum: ["Safe", "Moderate", "Harmful"],
              },
              healthierAlternatives: {
                type: Type.ARRAY,
                description: "1-3 specific healthier alternative products",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING, description: "Name of the healthier alternative product" },
                    reason: { type: Type.STRING, description: "Why this alternative is healthier (e.g., baked instead of fried, no artificial colors)" }
                  },
                  required: ["productName", "reason"]
                }
              }
            },
            required: ["productName", "ingredients", "summary", "overallSafety", "healthierAlternatives"],
          },
        },
      });

      let jsonStr = response.text?.trim() || "";
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n/, "").replace(/\n```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n/, "").replace(/\n```$/, "");
      }

      if (jsonStr) {
        const parsedResult = JSON.parse(jsonStr) as ScanResult;
        setResult(parsedResult);
        
        // Save to backend (MERN stack integration)
        if (parsedResult.ingredients.length > 0) {
          fetch("/api/scans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ingredients: parsedResult.ingredients.map(i => i.name).join(", "),
              harmfulIngredients: parsedResult.ingredients.filter(i => i.healthImpact === "Negative").map(i => i.name),
              summary: parsedResult.summary,
            }),
          }).then(() => fetchHistory())
            .catch(err => console.error("Failed to save scan history:", err));
        }
      } else {
        throw new Error("No response from AI");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze the image. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const positiveIngredients = result?.ingredients.filter(i => i.healthImpact === "Positive" || i.healthImpact === "Neutral") || [];
  const negativeIngredients = result?.ingredients.filter(i => i.healthImpact === "Negative") || [];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 right-4">
        <Button variant="outline" size="sm" asChild>
          <a href="/api/download-zip" download="project.zip">
            <Download className="w-4 h-4 mr-2" />
            Download Source Code
          </a>
        </Button>
      </div>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
            ScanIt
          </h1>
          <p className="text-lg text-slate-600">
            Ingredient Decoder App. Scan a label or barcode to see what's really inside.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <Card className="shadow-md h-fit sticky top-8">
              <CardHeader>
                <CardTitle>Scan Product</CardTitle>
                <CardDescription>Upload an image of an ingredient list or barcode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-100 flex flex-col items-center justify-center min-h-[350px]">
                  {image ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                      <img src={image} alt="Uploaded label" className="max-h-[300px] object-contain rounded-md shadow-sm" />
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute top-2 right-2 shadow-sm"
                        onClick={() => setImage(null)}
                      >
                        <X className="w-4 h-4 mr-1" /> Clear
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6 flex flex-col items-center p-8 text-center">
                      <div className="flex gap-4">
                        <Button 
                          size="lg"
                          variant="outline"
                          className="rounded-full w-32 h-32 flex flex-col gap-2 shadow-sm bg-white"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-10 h-10 text-slate-500" />
                          <span className="text-slate-600">Upload Image</span>
                        </Button>
                      </div>
                      <p className="text-sm text-slate-500">Upload barcodes or ingredient labels</p>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                <div className="pt-2">
                  <Button 
                    className="w-full text-lg py-6" 
                    onClick={analyzeImage}
                    disabled={!image || loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                        Analyzing Product...
                      </>
                    ) : (
                      "Decode Ingredients"
                    )}
                  </Button>
                </div>
                
                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {result ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="shadow-md border-t-4 border-t-primary">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-3xl font-bold">{result.productName}</CardTitle>
                        <CardDescription className="mt-2 text-base text-slate-700">{result.summary}</CardDescription>
                      </div>
                      <Badge 
                        variant={result.overallSafety === "Safe" ? "default" : result.overallSafety === "Moderate" ? "secondary" : "destructive"}
                        className="text-sm px-4 py-1.5 shadow-sm"
                      >
                        {result.overallSafety}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                {result.ingredients.length > 0 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Healthy / Neutral Column */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-emerald-800 flex items-center gap-2 border-b border-emerald-100 pb-2">
                          <ThumbsUp className="w-5 h-5" />
                          Healthy & Neutral
                        </h3>
                        {positiveIngredients.length > 0 ? (
                          <div className="space-y-3">
                            {positiveIngredients.map((ingredient, index) => (
                              <Card key={index} className="overflow-hidden border-emerald-100 bg-emerald-50/30 shadow-sm">
                                <div className="p-4">
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                        {ingredient.simpleName}
                                        {ingredient.healthImpact === "Positive" && <Leaf className="w-3.5 h-3.5 text-emerald-600" />}
                                      </h4>
                                      <p className="text-xs text-slate-500 font-mono mt-0.5">Listed as: {ingredient.name}</p>
                                    </div>
                                    <Badge variant="outline" className={ingredient.healthImpact === "Positive" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                                      {ingredient.healthImpact}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-slate-600 mt-2">{ingredient.description}</p>
                                  <div className="mt-2 text-xs text-emerald-800 bg-emerald-100/50 p-2 rounded border border-emerald-100/50">
                                    <span className="font-semibold">Why: </span>{ingredient.reasoning}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg border border-dashed">No healthy or neutral ingredients identified.</p>
                        )}
                      </div>

                      {/* Unhealthy Column */}
                      <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-red-800 flex items-center gap-2 border-b border-red-100 pb-2">
                          <ThumbsDown className="w-5 h-5" />
                          Unhealthy / Concerns
                        </h3>
                        {negativeIngredients.length > 0 ? (
                          <div className="space-y-3">
                            {negativeIngredients.map((ingredient, index) => (
                              <Card key={index} className="overflow-hidden border-red-200 bg-red-50/50 shadow-sm">
                                <div className="p-4">
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                        {ingredient.simpleName}
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                      </h4>
                                      <p className="text-xs text-slate-500 font-mono mt-0.5">Listed as: {ingredient.name}</p>
                                    </div>
                                    <Badge variant="destructive" className="shadow-sm">Negative</Badge>
                                  </div>
                                  <p className="text-sm text-slate-600 mt-2">{ingredient.description}</p>
                                  <div className="mt-2 text-xs text-red-800 bg-red-100 p-2 rounded border border-red-200">
                                    <span className="font-semibold">Concern: </span>{ingredient.reasoning}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-emerald-600 italic p-4 bg-emerald-50 rounded-lg border border-emerald-100 border-dashed flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> Great news! No harmful ingredients found.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Healthier Alternatives Section */}
                    {result.healthierAlternatives && result.healthierAlternatives.length > 0 && (
                      <Card className="shadow-md border-t-4 border-t-emerald-500 bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-emerald-900">
                            <Leaf className="w-5 h-5 text-emerald-600" />
                            Healthier Alternatives
                          </CardTitle>
                          <CardDescription>Consider these better options available in the market.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {result.healthierAlternatives.map((alt, idx) => (
                              <div key={idx} className="bg-white p-4 rounded-lg border border-emerald-100 shadow-sm flex flex-col h-full">
                                <h4 className="font-bold text-slate-900 mb-2">{alt.productName}</h4>
                                <div className="flex items-start gap-2 text-sm text-slate-600 mt-auto">
                                  <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  <p>{alt.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Ingredients Found</AlertTitle>
                    <AlertDescription>
                      We couldn't identify specific ingredients from this image. Try taking a clearer picture of the ingredient list.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <Card className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center min-h-[400px] border-dashed shadow-sm bg-slate-50/50">
                <Info className="w-12 h-12 mb-4 text-slate-300" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No results yet</h3>
                <p className="max-w-sm">
                  Scan a barcode or ingredient label, then click "Decode Ingredients" to see the analysis here.
                </p>
              </Card>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-12 space-y-4">
            <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-500" />
              Recent Scans
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((scan) => (
                <Card key={scan._id} className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base line-clamp-1">{scan.summary}</CardTitle>
                    <CardDescription className="text-xs">
                      {new Date(scan.timestamp).toLocaleDateString()} {new Date(scan.timestamp).toLocaleTimeString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="text-slate-600 line-clamp-2">
                        <span className="font-semibold text-slate-900">Ingredients:</span> {scan.ingredients}
                      </p>
                      {scan.harmfulIngredients.length > 0 && (
                        <p className="text-red-600 line-clamp-1">
                          <span className="font-semibold">Harmful:</span> {scan.harmfulIngredients.join(", ")}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
