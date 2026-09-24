import asyncio
import re
from app.models import QueryRequest, QueryResponse, APIError
from app.imagery import fetch_observation, water_change, EvidenceUnavailable
from app.services import Settings, geochat_answer, gemini_answer


async def handle_query(request: QueryRequest):
    settings = Settings.from_environment()
    result = QueryResponse(
        mode=request.mode, answer_text="Analysis unavailable.", request=request
    )
    result.warnings.append(
        "Confidence is uncalibrated. Review source imagery before using this result."
    )
    if request.mode == "fusion_demo":
        result.error = APIError(
            code="demo_disabled",
            message="Synthetic demo results are not available in the evidence workflow.",
        )
        return result
    try:
        if request.mode == "change_detection":
            before = await asyncio.to_thread(
                fetch_observation, request, request.date_range.start, "before"
            )
            result.images.append(before.image)
            after = await asyncio.to_thread(
                fetch_observation, request, request.date_range.end, "after"
            )
            result.images.append(after.image)
            result.change_summary = "Before and after observations are available for comparison."
            if re.search(r"\b(water|flood|river|lake|reservoir|coast|shore)\w*\b|पानी|जल|बाढ़|नदी", request.query, re.I):
                try:
                    result.metrics, result.change_geojson = water_change(before, after)
                    result.change_summary = (
                        f"Experimental water-class screening: {result.metrics['water_gain_ha']} ha gained; "
                        f"{result.metrics['water_loss_ha']} ha lost over valid overlapping pixels. This does not establish flood cause."
                    )
                except EvidenceUnavailable as error:
                    result.warnings.append(f"Water screening unavailable: {error}")
            if before.image.date >= after.image.date:
                raise EvidenceUnavailable("The acquired images do not form a distinct, chronological before/after pair. Choose wider-spaced dates or a smaller tolerance.")
            primary, secondary = after, before
            result.analysis_status = "partial"
            result.answer_text = result.change_summary
        else:
            primary = await asyncio.to_thread(
                fetch_observation,
                request,
                request.date,
                "optical" if request.mode == "fusion" else "single",
            )
            result.images.append(primary.image)
            secondary = None
            if request.mode == "fusion":
                try:
                    secondary = await asyncio.to_thread(
                        fetch_observation, request, request.date, "radar", True
                    )
                    if (
                        abs((primary.image.date - secondary.image.date).days)
                        > request.tolerance_days
                    ):
                        raise EvidenceUnavailable(
                            "Optical/radar acquisition separation exceeds the allowed tolerance."
                        )
                    result.images.append(secondary.image)
                    result.warnings.append(
                        "Optical/SAR visual comparison only; no calibrated fusion measurement is produced."
                    )
                except EvidenceUnavailable as error:
                    result.warnings.append(str(error))
                    result.answer_text = "Optical evidence is available, but radar is unavailable. Paired analysis was not run."
                    result.analysis_status = "partial"
                    return result
        prompt = f"Respond in {'Hindi' if request.language == 'hi' else 'English'}. {request.query}. Do not invent detections, measurements or absent evidence."
        prompt += (
            " Answer the user's specific question, including vegetation, built-up areas, bare ground, agriculture, water or other visible features as relevant."
            " Describe only supported visible evidence. If the question cannot be answered at this resolution, explain why."
            " Do not infer crop yield, species, ownership, exact building counts or causal explanations from appearance."
            " Images supplied to you are natural-colour optical imagery and, when labelled radar, a scene-stretched VV radar display."
        )
        if request.mode == "change_detection":
            prompt += " Compare the BEFORE and AFTER acquisition dates explicitly. Separate visible differences, unchanged features and uncertainty; cloud masks and seasonal/lighting differences are not proof of land-use change."
        elif request.mode == "fusion":
            prompt += " Answer using both labelled optical and radar images. They may have different acquisition dates. Radar brightness also depends on roughness, moisture and geometry; do not treat it as a direct land-cover label or quantitative cross-sensor change. State where the sensors agree or cannot resolve the question."
        if result.metrics:
            prompt += f" Measured screening output: {result.metrics}. Explain limitations and do not attribute cause."
        answer = None
        if secondary is None and settings.geochat_url:
            answer, _, _, _ = await geochat_answer(
                prompt, settings, primary.content, "image/png"
            )
            if answer:
                result.model_provider = "geochat"
        if not answer and settings.gemini_api_key:
            answer, _, _ = await gemini_answer(
                prompt,
                primary.content,
                settings.gemini_api_key,
                location=request.location,
                task=request.mode,
                comparison_image_data=secondary.content if secondary else None,
                primary_label=f"{primary.image.role}: {primary.image.date}",
                comparison_label=f"{secondary.image.role}: {secondary.image.date}"
                if secondary
                else "",
            )
            if answer:
                result.model_provider = "gemini"
        if answer:
            result.answer_text = answer
            result.analysis_status = "complete"
        else:
            result.analysis_status = "partial"
            result.answer_text = (
                result.change_summary
                or "Verified imagery is available. No compatible model returned an analysis."
            )
            result.warnings.append(
                "Model analysis unavailable. Paired tasks require a configured two-image provider."
            )
        return result
    except EvidenceUnavailable as error:
        result.analysis_status = "partial" if result.images else "unavailable"
        result.answer_text = str(error)
        result.error = APIError(code="evidence_unavailable", message=str(error))
        return result
