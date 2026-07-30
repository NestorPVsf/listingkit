import path from "node:path";
import { ZodError } from "zod";
import {
  getStoredAsset,
  getStoredAudioAsset,
} from "@/lib/infrastructure/files/local-asset-store";
import { prisma } from "@/lib/prisma";
import { propertyInputSchema } from "@/niches/inmobiliaria/schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const input = propertyInputSchema.parse(body);
    const assets = await Promise.all(
      input.photoAssetIds.map((assetId) => getStoredAsset(assetId)),
    );
    await Promise.all(
      [input.musicAssetId, input.narrationAssetId]
        .filter((assetId): assetId is string => assetId !== undefined)
        .map((assetId) => getStoredAudioAsset(assetId)),
    );

    const row = await prisma.property.create({
      data: {
        internalName: input.internalName,
        operation: input.operation,
        propertyType: input.propertyType,
        price: input.price,
        currency: input.currency,
        pricePeriod: input.pricePeriod,
        city: input.city,
        district: input.district,
        publicAddress: input.publicAddress,
        privateAddress: input.privateAddress,
        builtAreaM2: input.builtAreaM2,
        usableAreaM2: input.usableAreaM2,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        floor: input.floor,
        elevator: input.elevator,
        terrace: input.terrace,
        balcony: input.balcony,
        garage: input.garage,
        storageRoom: input.storageRoom,
        pool: input.pool,
        garden: input.garden,
        condition: input.condition,
        constructionYear: input.constructionYear,
        energyCertificateRating: input.energyCertificate?.rating,
        energyCertificateIdentifier: input.energyCertificate?.identifier,
        description: input.description,
        highlights: [...input.highlights],
        cta: input.cta,
        listingUrl: input.listingUrl,
        agentName: input.agent.name,
        agentPhone: input.agent.phone,
        agentEmail: input.agent.email,
        agencyName: input.agency.name,
        agencyWebsite: input.agency.website,
        primaryPhotoAssetId: input.primaryPhotoAssetId,
        musicAssetId: input.musicAssetId,
        narrationAssetId: input.narrationAssetId,
        explicitlyAllowedClaims: [...input.explicitlyAllowedClaims],
        photos: {
          create: assets.map((asset, index) => ({
            id: asset.id,
            path: path.basename(asset.storageKey),
            order: index,
            esMain: asset.id === input.primaryPhotoAssetId,
          })),
        },
      },
      select: { id: true },
    });

    return Response.json({ id: row.id }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "PROPERTY_INPUT_INVALID", issues: error.issues },
        { status: 400 },
      );
    }
    return Response.json(
      {
        error: "PROPERTY_CREATE_FAILED",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
