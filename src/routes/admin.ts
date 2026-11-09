import { verifyAdminRequest, verifyRequest } from "@/lib/auth";
import {
  deleteCategory as _deleteCategory,
  deleteNominee as _deleteNominee,
  setConfig as _setConfig,
  updateCategory as _updateCategory,
  updateNominee as _updateNominee,
  getAllUsers,
  getAllVotes,
  getAllVotesFiltered,
  getNominees,
  getUser,
  insertCategory,
  insertNominee,
  updateUserMakeAdmin,
} from "@/lib/data/driver";
import type { API, ImportableData, ViewingMode } from "@/lib/types";

export async function addCategory(req: Bun.BunRequest) {
  const session = await verifyRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }
  const user = await getUser(session.uid);
  if (!user || !user.admin) {
    return new Response(null, { status: 401 });
  }

  const data = await req.formData();
  const categoryId = data.get("category_id")?.toString();
  const categoryTitle = data.get("category_title")?.toString();
  const categoryDescription = data.get("category_description")?.toString();

  if (!categoryId || !categoryTitle || !categoryDescription) {
    return new Response(null, { status: 400 });
  }

  await insertCategory({
    id: categoryId,
    description: categoryDescription,
    title: categoryTitle,
  });

  return new Response(null, { status: 302, headers: [["Location", "/admin"]] });
}

export async function updateCategory(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const data: API.PATCH_CategoryRequest = await req.json();

  if (!data.id) {
    return new Response(null, { status: 400 });
  }

  await _updateCategory({
    id: data.id,
    description: data.description,
    title: data.title,
  });
  return new Response(null);
}

export async function updateNominee(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const data: API.PATCH_NomineeRequest = await req.json();

  if (!data.id || !data.categoryId) {
    return new Response(null, { status: 400 });
  }

  await _updateNominee(data);
  return new Response(null);
}

export async function deleteCategory(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return new Response(null, { status: 400 });
  }

  const result = await _deleteCategory(id);
  return Response.json(result);
}

export async function getUsers(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }
  const users = await getAllUsers();
  return Response.json(users satisfies API.GET_AllUsers);
}

export async function addNominee(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const data = await req.formData();
  const nomineeId = data.get("nominee_id")?.toString();
  const categoryId = data.get("category_id")?.toString();
  const nomineeTitle = data.get("nominee_title")?.toString();
  const imageId = data.get("image_id")?.toString();
  const videoId = data.get("video_id")?.toString();
  const url = data.get("url")?.toString();
  const nomineeDescription = data.get("nominee_description")?.toString();

  if (
    !nomineeId ||
    !categoryId ||
    !nomineeTitle ||
    !nomineeDescription ||
    !url
  ) {
    return new Response(null, { status: 400 });
  }

  await insertNominee({
    id: nomineeId,
    categoryId,
    description: nomineeDescription,
    title: nomineeTitle,
    imageId: imageId ?? null,
    url,
    videoId: videoId ?? null,
    renderType: "default",
  });

  return new Response(null, { status: 302, headers: [["Location", "/admin"]] });
}

export async function nomineesGet(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }
  const nominees = await getNominees();

  return Response.json(nominees satisfies API.GET_Nominees);
}

export async function deleteNominee(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const categoryId = params.get("categoryId");
  const id = params.get("id");

  if (!categoryId || !id) {
    return new Response(null, { status: 400 });
  }

  await _deleteNominee(categoryId, id);
  return new Response(null);
}

export async function getVotes(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const ipFilter = params.get("filter_ip") ?? undefined;
  const uidFilter = params.get("filter_uid") ?? undefined;
  const page = params.get("page");
  let offset = 0;
  if (page) {
    offset = parseInt(page) * 100;
  }

  let votes;
  if (ipFilter || uidFilter) {
    votes = await getAllVotesFiltered(offset, ipFilter, uidFilter);
  } else {
    votes = await getAllVotes(offset);
  }
  return Response.json(votes satisfies API.GET_AllVotes);
}

function isViewingMode(s: unknown): s is ViewingMode {
  const options: Array<ViewingMode> = ["idle", "locked", "reviewing", "voting"];
  return options.includes(s as ViewingMode);
}
export async function setConfig(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const data = await req.formData();
  const startTime = data.get("starting_time")?.toString();
  const endTime = data.get("ending_time")?.toString();
  const viewingMode = data.get("viewing_config")?.toString();
  if (!startTime || !endTime || !viewingMode) {
    return new Response(null, { status: 400 });
  }

  const s = parseInt(startTime);
  const e = parseInt(endTime);

  if (Number.isNaN(s) || Number.isNaN(e)) {
    return new Response(null, { status: 400 });
  }
  if (!isViewingMode(viewingMode)) {
    return new Response(null, { status: 400 });
  }

  await _setConfig(s, e, viewingMode);
  return new Response(null, { status: 302, headers: [["Location", "/admin"]] });
}

export async function importStaticData(req: Bun.BunRequest) {
  const formData = await req.formData();
  const rawData = formData.get("data")?.toString();

  if (!rawData) {
    return new Response(null, { status: 400 });
  }

  const data: ImportableData = JSON.parse(rawData);

  for (const category of data) {
    await insertCategory({
      id: category.id,
      description: category.description,
      title: category.title,
    });
    for (const option of category.options) {
      await insertNominee({
        id: option.id,
        description: option.description,
        imageId: option.imageId,
        renderType: option.renderType,
        title: option.title,
        url: option.url,
        videoId: option.videoId,
        categoryId: category.id,
      });
    }
  }

  return new Response(null, { status: 302, headers: [["Location", "/admin"]] });
}

export async function makeAdmin(req: Bun.BunRequest) {
  const session = await verifyAdminRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const data: API.PATCH_AdminUserRequest = await req.json();
  await updateUserMakeAdmin(data);

  return new Response(null);
}
