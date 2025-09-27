"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const PRICING = {
  meta: {
    currency: "AUD",
    product: "Clear Stickers",
    standardSizes: ["50", "75", "100", "125"],
    qtyTiers: [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000],
    baselineQty: 50,
    scaling: {
      baseSizeMm: 50,
      alpha: 0.6,
      note: "Sizes >50mm are scaled from 50mm using (size/50)^alpha",
    },
  },
  priceTable: {
    "50": {
      "50": 84,
      "100": 103,
      "200": 136,
      "300": 166,
      "500": 219,
      "1000": 338,
      "2000": 544,
      "3000": 729,
      "5000": 1067,
      "10000": 1813,
    },
    "75": {
      "50": 107.14,
      "100": 131.37,
      "200": 173.46,
      "300": 211.72,
      "500": 279.32,
      "1000": 431.09,
      "2000": 693.33,
      "3000": 929.69,
      "5000": 1358.35,
      "10000": 2309.57,
    },
    "100": {
      "50": 129.24,
      "100": 158.46,
      "200": 209.21,
      "300": 255.14,
      "500": 331.94,
      "1000": 512.31,
      "2000": 823.91,
      "3000": 1104.96,
      "5000": 1617.27,
      "10000": 2747.99,
    },
    "125": {
      "50": 145.56,
      "100": 178.48,
      "200": 235.67,
      "300": 287.66,
      "500": 379.5,
      "1000": 585.71,
      "2000": 942.68,
      "3000": 1263.26,
      "5000": 1848.96,
      "10000": 3141.68,
    },
  },
  fallback: {
    ratePerM2: 120,
    includeSpacingMm: 0,
    minW: 20,
    maxW: 1000,
    minH: 20,
    maxH: 1000,
    minQty: 1,
    maxQty: 200000,
    sizeStep: 5,
  },
}

const REVERSE_WINDOW_CFG = {
  surchargePct: 0.08, // +8% over Clear pricing
}

const tiers = PRICING.meta.qtyTiers.slice().sort((a, b) => a - b)
const alpha = PRICING.meta.scaling?.alpha ?? 0.6
const baseSize = PRICING.meta.scaling?.baseSizeMm ?? 50
const surcharge = 1 + (REVERSE_WINDOW_CFG.surchargePct || 0)

function pickTier(q: number) {
  let t = tiers[0]
  for (const x of tiers) if (q >= x) t = x
  return t
}

function scaleFactorFromBase(sizeMm: number) {
  return Math.pow(sizeMm / baseSize, alpha)
}

function priceReverseWindow({ widthMm, heightMm, qty }: { widthMm: number; heightMm: number; qty: number }) {
  // For round stickers, use the width as diameter
  const sizeMm = widthMm
  const sizeKey = String(sizeMm)
  const clearTable = PRICING.priceTable[sizeKey as keyof typeof PRICING.priceTable]
  const tier = pickTier(qty)

  let totalTier: number, basePerUnit: number

  if (clearTable) {
    // Standard size: take clear totals and add surcharge
    totalTier = clearTable[String(tier) as keyof typeof clearTable] * surcharge
    basePerUnit = (clearTable["50"] / 50) * surcharge // 50-qty baseline
  } else {
    // Custom size: scale from base size for Clear, then surcharge
    const f = scaleFactorFromBase(sizeMm)
    const baseTable = PRICING.priceTable[String(baseSize) as keyof typeof PRICING.priceTable]
    totalTier = baseTable[String(tier) as keyof typeof baseTable] * f * surcharge
    basePerUnit = ((baseTable["50"] * f) / 50) * surcharge
  }

  const unitNow = totalTier / tier
  const savePct = Math.round((1 - unitNow / basePerUnit) * 100)

  // next-tier CTA
  let nextInfo = null
  for (const t of tiers) {
    if (t > qty) {
      const nextTotal =
        (clearTable
          ? clearTable[String(t) as keyof typeof clearTable]
          : PRICING.priceTable[String(baseSize) as keyof typeof PRICING.priceTable][
              String(t) as keyof (typeof PRICING.priceTable)[typeof baseSize]
            ] * (clearTable ? 1 : scaleFactorFromBase(sizeMm))) * surcharge
      const nextUnit = nextTotal / t
      nextInfo = { addMore: t - qty, nextTier: t, nextSavePct: Math.round((1 - nextUnit / basePerUnit) * 100) }
      break
    }
  }

  return {
    size: { widthMm, heightMm, standard: !!clearTable },
    qty: qty,
    pricingMode: clearTable ? "lookup" : "area-fallback",
    tierUsed: tier,
    baseUnit50: +basePerUnit.toFixed(4),
    unitPrice: +unitNow.toFixed(4),
    totalPrice: +totalTier.toFixed(2),
    savePct,
    nextTier: nextInfo,
  }
}

const sizes = [
  { label: "50 mm", width: 50, height: 50 },
  { label: "75 mm", width: 75, height: 75 },
  { label: "100 mm", width: 100, height: 100 },
  { label: "125 mm", width: 125, height: 125 },
]

export default function StickerCalculator() {
  const [selectedSize, setSelectedSize] = useState<(typeof sizes)[0] | null>(null)
  const [customWidth, setCustomWidth] = useState<number | null>(null)
  const [customHeight, setCustomHeight] = useState<number | null>(null)
  const [selectedQuantity, setSelectedQuantity] = useState<number | null>(null)
  const [customQuantity, setCustomQuantity] = useState<number | null>(null)
  const [showCustomSize, setShowCustomSize] = useState(false)
  const [showCustomQuantity, setShowCustomQuantity] = useState(false)
  const [selectedFinish, setSelectedFinish] = useState("")
  const [isReorder, setIsReorder] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [artworkMethod, setArtworkMethod] = useState("")
  const [shippingMethod, setShippingMethod] = useState("13.95")
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState<"configure" | "details">("configure")

  const width = customWidth || selectedSize?.width || 0
  const height = customHeight || selectedSize?.height || 0
  const quantity = customQuantity || selectedQuantity || 0

  let pricingResult = null
  let total = 0
  let unitPrice = 0
  let upsellMsg = ""

  if (width > 0 && height > 0 && quantity > 0) {
    try {
      pricingResult = priceReverseWindow({
        widthMm: width,
        heightMm: height,
        qty: quantity,
      })

      const normalTotal = pricingResult.totalPrice

      total = normalTotal
      unitPrice = pricingResult.unitPrice

      // Normal upsell message
      if (pricingResult.nextTier) {
        upsellMsg = `Save ${pricingResult.nextTier.nextSavePct}% when you add ${pricingResult.nextTier.addMore} stickers`
      } else if (pricingResult.savePct > 0) {
        upsellMsg = `You saved ${pricingResult.savePct}%`
      }
    } catch (error) {
      console.error("Pricing error:", error)
    }
  }

  let shippingCost = 0
  let shippingMessage = ""

  if (total > 0) {
    if (total < 60) {
      shippingCost = Number.parseFloat(shippingMethod)
      shippingMessage = "Choose between Express or Standard Shipping."
    } else if (total >= 60 && total < 100) {
      shippingCost = 0
      shippingMessage = "You have received free Standard Shipping."
    } else if (total >= 100) {
      shippingCost = 0
      shippingMessage = "You have received free Express Shipping."
    }
  }

  const finalTotal = total + shippingCost

  useEffect(() => {
    const savedImages = localStorage.getItem("sticker-artwork-images")
    if (savedImages) {
      setUploadedImages(JSON.parse(savedImages))
    }
  }, [])

  useEffect(() => {
    if (uploadedImages.length > 0) {
      localStorage.setItem("sticker-artwork-images", JSON.stringify(uploadedImages))
    } else {
      localStorage.removeItem("sticker-artwork-images")
    }
  }, [uploadedImages])

  useEffect(() => {
    if (total >= 100) {
      setShippingMethod("0") // Free Express
    } else if (total >= 60) {
      setShippingMethod("0") // Free Standard
    } else {
      // Keep current selection or default to Express
      if (shippingMethod === "0") {
        setShippingMethod("13.95")
      }
    }
  }, [total])

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newImageUrls: string[] = []

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

        const { data, error } = await supabase.storage.from("artwork-files").upload(fileName, file)

        if (error) {
          console.error("Upload error:", error)
          alert(`Failed to upload ${file.name}. Please try again.`)
          continue
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("artwork-files").getPublicUrl(fileName)

        newImageUrls.push(publicUrl)
      }

      if (newImageUrls.length > 0) {
        setUploadedImages((prev) => [...prev, ...newImageUrls])
      }
    } catch (error) {
      console.error("Error uploading images:", error)
      alert("Upload failed. Please check your connection and try again.")
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const removeImage = (imageUrl: string) => {
    setUploadedImages((prev) => prev.filter((url) => url !== imageUrl))
  }

  const handleContinue = () => {
    if (currentStep === "configure") {
      setCurrentStep("details")
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    setCurrentStep("configure")
  }

  const handleSubmit = () => {
    console.log("Form submitted - Ready to order!")
  }

  const isFormReady = (selectedSize || (customWidth && customHeight)) && (selectedQuantity || customQuantity)

  return (
    <main className="min-h-screen bg-gray-50 p-2 sm:p-4 flex items-center justify-center">
      <div className="w-full max-w-xs sm:max-w-md lg:max-w-xl xl:max-w-2xl bg-white rounded-lg p-3 sm:p-6 lg:p-8 shadow-sm border border-gray-200">
        <form className="space-y-3 sm:space-y-6">
          {currentStep === "configure" && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="size" className="text-gray-700 font-medium text-xs sm:text-sm">
                    Size
                  </label>
                </div>
                <select
                  id="size"
                  value={showCustomSize ? "custom" : selectedSize?.label || ""}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setShowCustomSize(true)
                      setSelectedSize(null)
                    } else {
                      setShowCustomSize(false)
                      const size = sizes.find((s) => s.label === e.target.value)
                      setSelectedSize(size || null)
                      setCustomWidth(null)
                      setCustomHeight(null)
                    }
                  }}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white appearance-none text-sm sm:text-base"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: "right 0.5rem center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "1.5em 1.5em",
                  }}
                >
                  <option value="">Select</option>
                  {sizes.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                  <option value="custom">Custom size</option>
                </select>

                {showCustomSize && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="number"
                      placeholder="Width (mm)"
                      className="border border-gray-300 rounded-md p-2 w-1/2 text-sm sm:text-base"
                      value={customWidth ?? ""}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || null)}
                    />
                    <input
                      type="number"
                      placeholder="Height (mm)"
                      className="border border-gray-300 rounded-md p-2 w-1/2 text-sm sm:text-base"
                      value={customHeight ?? ""}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || null)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="quantity" className="text-gray-700 font-medium text-xs sm:text-sm">
                  Quantity
                </label>
                <select
                  id="quantity"
                  value={showCustomQuantity ? "custom" : selectedQuantity || ""}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setShowCustomQuantity(true)
                      setSelectedQuantity(null)
                    } else {
                      setShowCustomQuantity(false)
                      setSelectedQuantity(Number(e.target.value) || null)
                      setCustomQuantity(null)
                    }
                  }}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white appearance-none text-sm sm:text-base"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: "right 0.5rem center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "1.5em 1.5em",
                  }}
                >
                  <option value="">Select</option>
                  {(() => {
                    if (width > 0 && height > 0) {
                      const sizeKeyStr = String(width)
                      const isStandard = PRICING.meta.standardSizes.includes(sizeKeyStr)

                      if (isStandard) {
                        const priceData = PRICING.priceTable[sizeKeyStr as keyof typeof PRICING.priceTable]

                        return PRICING.meta.qtyTiers
                          .map((qty) => {
                            const price = priceData?.[String(qty) as keyof typeof priceData]
                            const finalPrice = price ? (price * surcharge).toFixed(2) : null
                            return finalPrice ? (
                              <option key={qty} value={qty}>
                                {qty} stickers • ${finalPrice}
                              </option>
                            ) : null
                          })
                          .filter(Boolean)
                      } else {
                        return PRICING.meta.qtyTiers
                          .map((qty) => {
                            try {
                              const result = priceReverseWindow({ widthMm: width, heightMm: height, qty })
                              return (
                                <option key={qty} value={qty}>
                                  {qty} stickers • ${result.totalPrice}
                                </option>
                              )
                            } catch {
                              return null
                            }
                          })
                          .filter(Boolean)
                      }
                    } else {
                      // No size selected, show basic quantities
                      return PRICING.meta.qtyTiers.map((q) => (
                        <option key={q} value={q}>
                          {q} stickers
                        </option>
                      ))
                    }
                  })()}
                  <option value="custom">Custom quantity</option>
                </select>

                {showCustomQuantity && (
                  <input
                    type="number"
                    min={1}
                    placeholder="Enter quantity"
                    className="border border-gray-300 rounded-md p-2 w-full mt-2 text-sm sm:text-base"
                    value={customQuantity ?? ""}
                    onChange={(e) => setCustomQuantity(Number(e.target.value) || null)}
                  />
                )}

                {/* Upsell message */}
                {quantity > 0 && upsellMsg && (
                  <div className="text-green-600 text-xs sm:text-sm font-medium">{upsellMsg}</div>
                )}
              </div>
            </>
          )}

          {currentStep === "details" && (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-xs sm:text-sm"
              >
                ← Back
              </button>

              <div>
                <label htmlFor="finish" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                  Finish
                </label>
                <select
                  id="finish"
                  value={selectedFinish}
                  onChange={(e) => setSelectedFinish(e.target.value)}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white text-sm sm:text-base"
                >
                  <option value="">-- Select --</option>
                  <option value="standard">Standard - light scratch resistant great for promo!</option>
                  <option value="matte">Super Ninja Glossy - 100% weather resistant / dishwasher safe!</option>
                  <option value="gloss">Moshi Moshi Matte - recommended for indoor use</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reorder"
                  checked={isReorder}
                  onChange={(e) => setIsReorder(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="reorder" className="text-gray-700 font-medium text-xs sm:text-sm">
                  Is this a reorder?
                </label>
              </div>

              {isReorder && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="invoice-number" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      id="invoice-number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Enter your invoice number"
                      className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 text-sm sm:text-base"
                    />
                  </div>

                  {invoiceNumber.trim() && (
                    <button
                      type="button"
                      className="bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-blue-600 transition-colors text-xs sm:text-sm font-medium"
                    >
                      Skip proof
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="text-gray-700 font-medium text-xs sm:text-sm block mb-3">
                  How will your print ready artwork be supplied?
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "ready" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("ready")}
                  >
                    I have print-ready files
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "design" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("design")}
                  >
                    Design my own online
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "help" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("help")}
                  >
                    I need design assistance
                  </button>
                </div>
              </div>

              {artworkMethod === "ready" && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 sm:p-4 text-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <label
                      htmlFor="upload-artwork"
                      className="block cursor-pointer text-gray-700 font-medium text-xs sm:text-sm"
                    >
                      {isUploading ? "Uploading..." : "Click to upload artwork"}
                    </label>
                    <input
                      type="file"
                      id="upload-artwork"
                      name="upload-artwork"
                      className="hidden"
                      multiple
                      accept=".ai,.eps,.pdf,.png,.jpg,.jpeg"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Accepted file types: ai, eps, pdf, png, jpg. Max: 250MB
                    </div>
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {uploadedImages.map((imageUrl, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                            <img
                              src={imageUrl || "/placeholder.svg"}
                              alt={`Uploaded artwork ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImage(imageUrl)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold hover:bg-red-600 transition-colors"
                            title="Remove image"
                          >
                            ❌
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {artworkMethod === "design" && (
                <div className="p-4 border border-gray-300 rounded bg-gray-50">
                  <p className="text-gray-700 text-sm">Redirecting to Sticker Ninja Designer...</p>
                  {/* Later you'll integrate with the actual design tool */}
                </div>
              )}

              {artworkMethod === "help" && (
                <div className="p-4 border border-gray-300 rounded bg-gray-50">
                  <p className="text-gray-700 text-sm">Feature coming soon...</p>
                </div>
              )}

              <div>
                <label htmlFor="shipping-method" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                  Shipping Method
                </label>
                <select
                  id="shipping-method"
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value)}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white text-sm sm:text-base"
                  disabled={total >= 60}
                >
                  {total >= 100 ? (
                    <option value="0">Express Shipping - FREE</option>
                  ) : total >= 60 ? (
                    <option value="0">Standard Shipping - FREE</option>
                  ) : (
                    <>
                      <option value="8.95">Standard Shipping - $8.95</option>
                      <option value="13.95">Express Shipping - $13.95</option>
                    </>
                  )}
                </select>
                {shippingMessage && (
                  <div className="text-green-600 text-xs sm:text-sm mt-2 font-medium">{shippingMessage}</div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-gray-200 pt-4 sm:pt-6">
            {/* Normal pricing display */}
            <div className="flex justify-between items-center mb-4">
              <div className="text-2xl sm:text-4xl font-bold text-gray-900">${finalTotal.toFixed(2)}</div>
              <div className="text-gray-600 text-xs sm:text-sm">
                ${quantity > 0 ? (finalTotal / quantity).toFixed(2) : "0.00"} / sticker
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className={`w-full font-semibold py-3 px-4 rounded-md transition-colors text-sm sm:text-base ${
                isFormReady ? "bg-black text-white hover:bg-gray-800" : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              disabled={!isFormReady}
            >
              {currentStep === "configure" ? "Continue" : "Ready to order?"}
            </button>

            {currentStep === "configure" && (
              <div className="text-center text-gray-500 text-xs sm:text-sm mt-2">Next: upload artwork →</div>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
