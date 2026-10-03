import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { IssueListItem, SeverityEstimate } from "../api/types";
import { projectPoints } from "../domain/projection";
import { label } from "../domain/labels";
import styles from "./IssueMap.module.css";

interface Props {
  items: IssueListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown when there are no markers. */
  emptyText?: string;
}

/** Marker letter, so severity is never conveyed by colour alone. */
const LETTER: Record<SeverityEstimate | "UNKNOWN", string> = {
  CRITICAL: "C",
  HIGH: "H",
  MODERATE: "M",
  LOW: "L",
  NONE: "N",
  UNKNOWN: "?",
};
const LEGEND: (SeverityEstimate | "UNKNOWN")[] = ["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"];

/**
 * OpenStreetMap basemap (Leaflet, no API key; light demo use under the OSM tile policy).
 * The tiles come from Leaflet, but markers stay React buttons positioned over the map, so
 * keyboard access, aria-pressed and labels are unchanged. Without a laid-out map (tests,
 * or before the first layout) markers fall back to the schematic projection.
 * Faint circles show each issue's location uncertainty; positions are never exact.
 */
export function IssueMap({ items, selectedId, onSelect, emptyText = "No issues match the current filters." }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<L.LayerGroup | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.setView([14.6, 121.0], 11); // Metro Manila
    circlesRef.current = L.layerGroup().addTo(map);
    const rerender = () => setTick((t) => t + 1);
    map.on("move zoom resize viewreset", rerender);
    mapRef.current = map;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => map.invalidateSize()) : null;
    ro?.observe(mapEl.current);
    return () => {
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit to the current issues and draw uncertainty circles whenever the set changes.
  const key = items.map((i) => i.issue.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || items.length === 0) return;
    circlesRef.current?.clearLayers();
    for (const i of items) {
      if (i.issue.locationUncertaintyM) {
        L.circle([i.issue.location.latitude, i.issue.location.longitude], {
          radius: i.issue.locationUncertaintyM,
          weight: 1,
          color: "#475569",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(circlesRef.current!);
      }
    }
    const bounds = L.latLngBounds(items.map((i) => [i.issue.location.latitude, i.issue.location.longitude] as [number, number]));
    if (map.getSize().x > 0) map.fitBounds(bounds.pad(0.25), { maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const map = mapRef.current;
  const live = !!map && map.getSize().x > 0;
  const fallback = projectPoints(items.map((i) => i.issue.location));
  const position = (item: IssueListItem, idx: number) => {
    if (!live) return { left: `${fallback[idx]!.x}%`, top: `${fallback[idx]!.y}%` };
    const p = map!.latLngToContainerPoint([item.issue.location.latitude, item.issue.location.longitude]);
    return { left: `${p.x}px`, top: `${p.y}px` };
  };

  return (
    <section className={styles.map} aria-labelledby="issue-map-title">
      <div className={styles.head}>
        <h2 id="issue-map-title" className={styles.title}>
          Issue map
        </h2>
        <span className={styles.tag}>OpenStreetMap</span>
        <p className={styles.note}>Positions are approximate; circles show location uncertainty.</p>
      </div>
      <div className={styles.stage}>
        <div className={styles.canvas}>
          <div ref={mapEl} className={styles.basemap} aria-hidden="true" />
          {items.length === 0 && <p className={styles.empty}>{emptyText}</p>}
          <div className={styles.plot} data-live={live}>
            {items.map((item, idx) => {
              const sev = item.severity ?? "UNKNOWN";
              return (
                <button
                  key={item.issue.id}
                  type="button"
                  className={styles.marker}
                  data-severity={sev}
                  aria-pressed={item.issue.id === selectedId}
                  aria-label={`Map marker: ${label(item.issue.issueType)}, ${item.severity ? `${label(item.severity)} severity` : "severity unknown"}, ${item.issue.areaName ?? "area unknown"}`}
                  style={position(item, idx)}
                  onClick={() => onSelect(item.issue.id)}
                >
                  <span aria-hidden="true">{LETTER[sev]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ul className={styles.legend} aria-label="Map legend">
          {LEGEND.map((s) => (
            <li key={s}>
              <span className={styles.legendSwatch} data-severity={s} aria-hidden="true">
                {LETTER[s]}
              </span>
              {s === "UNKNOWN" ? "Severity unknown" : label(s)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
