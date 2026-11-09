import { topPosts } from "@/data";
export function TopPosts() {
  return (
    <div className="space-y-4 p-2">
      <div
        className="bg-blue-1/10 relative rounded p-4 lg:mx-auto lg:grid lg:max-w-7xl lg:grid-cols-3 lg:items-center"
      >
        {topPosts.map((post, _index, _array) => (
          <div className="text-center" key={post.url}>
            <a href={post.url} className="hover:underline hover:brightness-115 transition-all [&]:after:content-['↗'] [&]:after:text-orange-1 inline-block no-underline peer-hover:underline" target="_blank">
              {post.title}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
