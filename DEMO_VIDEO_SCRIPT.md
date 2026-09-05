# SatQuery: 2-to-3 Minute Prototype Demo Video Script

**Target Duration**: 2 Minutes 45 Seconds (165 Seconds)  
**Speaker Tone**: Confident, technical, dynamic, professional (Smart India Hackathon / Demo Pitch style)  
**Format**: Single presenter on camera + full-screen browser screencast (1080p 60fps)

---

## Pre-Recording Checklist & Setup
1. **Screen Resolution**: 1920x1080 (100% DPI zoom).
2. **Browser Window**: Google Chrome open to `http://localhost:5173/` in full-screen (`F11`).
3. **Backend Server**: Ensure FastAPI backend is active on `http://127.0.0.1:8000`.
4. **Microphone**: Clean audio without background noise.
5. **Preset Tabs**: Open one tab ready on the home page, and have a second tab pre-loaded with a query result if you want instantaneous transitions.

---

## Video Script & Storyboard

```
TIMECODE        VISUAL ON SCREEN                                   SPEAKER VOICEOVER / SCRIPT
===================================================================================================================================
[0:00 - 0:25]   [FULL SCREEN / WEBCAM WITH LOGO OVERLAY]          "Hello everyone! Satellite imagery is one of the most powerful
                Camera on presenter, then cuts to the              tools for disaster management, defense, and urban planning.
                SatQuery web application landing page.             Yet today, querying Earth Observation data requires specialized
                                                                   GIS software, complex band combinations, and massive processing
                Mouse cursor hovers smoothly over the              overhead. Worse still, when floods or monsoons strike, optical
                clean dark-themed interface.                       satellites are blinded by heavy cloud cover.
                                                                   
                                                                   Meet SatQuery — an intelligent multimodal satellite intelligence
                                                                   platform that lets anyone ask questions about our planet in natural
                                                                   language, track temporal changes, and fuse optical and SAR radar
                                                                   imagery with zero hallucination."

-----------------------------------------------------------------------------------------------------------------------------------
[0:25 - 0:55]   [SCREEN RECORDING: INTERACTIVE MAP & AUTOCOMPLETE] "Let's start with geospatial targeting. In our Interactive Map,
                Presenter clicks the search bar in the map         we've integrated a high-performance, Google Maps-style location
                toolbar and types: "Kedarnath".                    autocomplete typeahead.
                
                The autocomplete dropdown pops up showing          As I type 'Kedarnath', SatQuery instantly resolves the Himalayan
                preset info, coordinates (30.73°N, 79.06°E).       flood monitoring zone. With one click, our Leaflet map smoothly
                
                Presenter presses Enter; map flies to Kedarnath.   flies to the target coordinates, setting our Sentinel-2 observation
                Camera zooms into the browser address bar to       footprint.
                highlight the synchronized URL:
                `?lat=30.7346&lon=79.0669&loc=Kedarnath`          Notice how the browser URL updates in real time — exactly like Google
                                                                   Maps. You can share this exact deep link with any response team,
                                                                   and the platform automatically hydrates the location state."

-----------------------------------------------------------------------------------------------------------------------------------
[0:55 - 1:35]   [SCREEN RECORDING: VQA & CHANGE DETECTION]        "Now, let's explore Visual Question Answering and Temporal Change.
                Presenter switches to Visual Question Answering,   
                clicks preset 'New Delhi', and selects chip:       In VQA mode, we query ESA Sentinel-2 MSI surface reflectance data.
                '+ Detect surface water bodies & channels'.        SatQuery retrieves the clearest 10-meter resolution scene and passes
                
                Clicks 'Ask SatQuery'. Result loads with           it to our Vision Language pipeline. It highlights water bodies with
                detailed answer and cyan bounding boxes.           precise bounding boxes and provides calibrated confidence metrics.
                
                Presenter toggles 'Change Detection' mode.         Next, in Change Detection mode, we pick a baseline date from 2023
                Selects 2023 vs 2024 dates.                        and an observation date from 2024. Our interactive comparison slider
                Drags the horizontal Before/After swipe slider.    lets us swipe between observations, visually isolating urban expansion
                                                                   and flood line displacement across time."

-----------------------------------------------------------------------------------------------------------------------------------
[1:35 - 2:20]   [SCREEN RECORDING: MULTIMODAL SENSOR FUSION]      "Now for our core breakthrough: Multimodal Sensor Fusion.
                Presenter clicks 'Sensor Fusion' in the top bar.   
                Selects prompt: '+ Detect flood extent and         When monsoons or cloud cover obscure optical satellites, SatQuery
                standing water by fusing optical and SAR radar'.   dynamically pairs Sentinel-2 multispectral imagery with active
                                                                   Sentinel-1 C-Band Synthetic Aperture Radar.
                Clicks 'Analyze Sensor Fusion'. The scanner ring   
                animates, then the 4-mode Fusion Inspector appears. Because microwave radar pulses at 5.405 GHz penetrate clouds
                                                                   and night, smooth water surfaces produce specular radar attenuation,
                1. Presenter drags the 'Split Swipe' handle        appearing deep black, while concrete structures bounce back bright.
                   left and right.
                2. Clicks 'Opacity Blend' tab, moves slider to     With our 4-mode Fusion Inspector, analysts can use the Split Swipe
                   50/50, then clicks 'Radar Only'.                divider, cross-fade opacity with continuous blending, view side-by-side
                3. Clicks 'Color Composite' false-color view.      comparisons, or render false-color radar-optical composites.
                4. Scrolls down to show the Remote Sensing         
                   metadata breakdown cards.                       All tiles are pixel-aligned at zoom 14, guaranteeing 100% spatial
                                                                   coherence."

-----------------------------------------------------------------------------------------------------------------------------------
[2:20 - 2:45]   [CAMERA ON PRESENTER + FULL UI OVERVIEW]           "Finally, SatQuery adheres to strict scientific honesty. Our
                Presenter shows the Honesty Metric Panel and       Honesty Panel and calibrated confidence flags ensure defense and
                system integrity breakdown.                        disaster teams always know whether observations are high confidence
                                                                   or require ground verification.
                Closing graphic with SatQuery logo, GitHub repo,   
                and team credits.                                  SatQuery transforms raw, complex Earth Observation streams into
                                                                   instant, actionable spatial intelligence for India and the world.
                                                                   
                                                                   Thank you!"
===================================================================================================================================
```

---

## Presenter Tips for a Winning Delivery
- **Pacing**: Speak at an energetic, steady conversational rate (~140 words per minute).
- **Mouse Movement**: Move the cursor deliberately. Avoid erratic circular wiggling; pause for 0.5s after clicking buttons so the viewer can follow the UI interaction.
- **Swipe Interaction**: When demonstrating the **Split Swipe** and **Opacity Blend** sliders, drag back and forth smoothly across the center of the screen to showcase the optical-radar alignment.
- **Key Buzzwords to Emphasize**:
  - *"Multimodal Sensor Fusion"*
  - *"C-Band Synthetic Aperture Radar (SAR)"*
  - *"Pixel-Aligned WebMercator Quad Tiles"*
  - *"Google Maps-Style Autocomplete & URL Synchronization"*
  - *"Zero-Hallucination Confidence Metrics"*
