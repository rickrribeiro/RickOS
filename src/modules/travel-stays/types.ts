import { t } from '../../i18n'
export type ProviderName = 'booking' | 'airbnb' | 'agoda' | 'trip' | 'mock'

export type AccommodationType = 'apartment' | 'studio' | 'hotel' | 'aparthotel' | 'hostel' | 'private_room' | 'shared_room'

export const ACCOMMODATION_LABELS: Record<AccommodationType, string> = {
  apartment: t('travel.apartamentoInteiro'),
  studio: t('travel.studio'),
  hotel: t('travel.hotel'),
  aparthotel: t('travel.apartHotel'),
  hostel: t('travel.hostel'),
  private_room: t('travel.quartoPrivado'),
  shared_room: t('travel.quartoCompartilhado')
}

export type Amenity =
  | 'wifi'
  | 'gym'
  | 'air_conditioning'
  | 'kitchen'
  | 'washing_machine'
  | 'workspace'
  | 'elevator'
  | 'self_checkin'
  | 'free_cancellation'
  | 'private_bathroom'

export const AMENITY_LABELS: Record<Amenity, string> = {
  wifi: t('travel.wiFi'),
  gym: t('travel.academia'),
  air_conditioning: t('travel.arCondicionado'),
  kitchen: t('travel.cozinha'),
  washing_machine: t('travel.maquinaDeLavar'),
  workspace: t('travel.mesaDeTrabalho'),
  elevator: t('travel.elevador'),
  self_checkin: t('travel.checkInAutomatico'),
  free_cancellation: t('travel.cancelamentoGratis'),
  private_bathroom: t('travel.banheiroPrivativo')
}

export interface SearchInput {
  city: string
  country?: string
  neighborhoods: string[]
  excludedNeighborhoods: string[]
  lat?: number
  lng?: number
  maxDistanceKm?: number
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  flexibleDays: number
  maxPricePerNight?: number
  maxTotalPrice?: number
  currency: string
  accommodationTypes: AccommodationType[]
  excludeSharedRoom: boolean
  requiredAmenities: Amenity[]
  preferredAmenities: Amenity[]
  minRating?: number
  minReviews?: number
  preferredProvider?: ProviderName
}

export interface ProviderStayResult {
  id: string
  provider: ProviderName
  title: string
  neighborhood?: string
  address?: string
  latitude?: number
  longitude?: number
  pricePerNight: number
  totalPrice: number
  currency: string
  rating?: number
  reviewCount?: number
  roomType: AccommodationType
  amenities: Amenity[]
  cancellationFree?: boolean
  imageUrl?: string
  listingUrl: string
  badges?: string[]
}

export interface StayResult extends ProviderStayResult {
  distanceKm?: number
  score: number
  alsoOn?: ProviderName[] // other providers where a duplicate was found
  bestDates?: { checkIn: string; checkOut: string } // when found via a flexible-date shift
}

export interface StayFavorite {
  id: string
  tripId: number | null
  provider: string
  listingUrl: string
  title: string
  pricePerNight: number
  currency: string
  data: string // JSON of StayResult
  createdAt: string
}

export interface StayWatch {
  id: string
  city: string
  filters: string // JSON SearchInput
  currentPrice: number
  bestPrice: number
  currency: string
  lastCheckedAt: string | null
  createdAt: string
}

export interface StayPricePoint {
  id: string
  watchId: string
  checkedAt: string
  price: number
  currency: string
}

export interface StaySearchHistory {
  id: number
  filters: string // JSON SearchInput
  createdAt: string
}
