"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin, Phone, Mail } from "lucide-react";
import { PROPERTY, telHref } from "@/lib/property";

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactForm = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const t = useTranslations("contactPage");
  const fieldId = useId();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({ resolver: zodResolver(contactSchema) });

  async function onSubmit(data: ContactForm) {
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
      reset();
    } catch {
      setError("Something went wrong. Please try again.");
    }
  }

  const details = [
    { icon: MapPin, label: t("visitTitle"), value: PROPERTY.address },
    { icon: Phone, label: t("callTitle"), value: PROPERTY.phone, href: telHref() },
    { icon: Mail, label: t("emailTitle"), value: PROPERTY.email, href: `mailto:${PROPERTY.email}` },
  ];

  return (
    <div className="min-h-screen bg-earth-bg py-20">
      <div className="container-resort">
        <div className="text-center mb-12">
          <p className="section-subheading mb-2">{t("subtitle")}</p>
          <h1 className="section-heading">{t("title")}</h1>
          <p className="font-sans text-earth-text/70 max-w-xl mx-auto mt-4">{t("intro")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 max-w-5xl mx-auto">
          {/* Details */}
          <div className="md:col-span-2 space-y-6">
            {details.map(({ icon: Icon, label, value, href }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-serif text-sm text-earth-text/70">{label}</p>
                  {href ? (
                    <a href={href} className="font-sans text-earth-text hover:text-primary transition-colors">{value}</a>
                  ) : (
                    <p className="font-sans text-earth-text">{value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="md:col-span-3 bg-earth-white rounded-sm shadow-sm p-6 sm:p-8">
            {submitted ? (
              <p className="font-sans text-primary text-center py-8">{t("success")}</p>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
                )}

                <div>
                  <label htmlFor={`${fieldId}-name`} className="font-sans text-sm text-earth-text/70 block mb-1">{t("name")} *</label>
                  <input id={`${fieldId}-name`} {...register("name")}
                    className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label htmlFor={`${fieldId}-email`} className="font-sans text-sm text-earth-text/70 block mb-1">{t("email")} *</label>
                  <input id={`${fieldId}-email`} type="email" {...register("email")}
                    className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <label htmlFor={`${fieldId}-phone`} className="font-sans text-sm text-earth-text/70 block mb-1">{t("phone")}</label>
                  <input id={`${fieldId}-phone`} type="tel" {...register("phone")}
                    className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary" />
                </div>

                <div>
                  <label htmlFor={`${fieldId}-message`} className="font-sans text-sm text-earth-text/70 block mb-1">{t("message")} *</label>
                  <textarea id={`${fieldId}-message`} rows={4} placeholder={t("messagePlaceholder")} {...register("message")}
                    className="w-full border border-primary-200 rounded-sm px-3 py-2.5 font-sans text-sm focus:outline-none focus:border-primary resize-none" />
                  {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message.message}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                  {isSubmitting ? t("sending") : t("submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
